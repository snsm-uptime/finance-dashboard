---
title: 'User profile photo with initials-circle fallback'
type: 'feature'
created: '2026-09-01'
status: 'done'
review_loop_iteration: 0
context: []
baseline_commit: '7cc8c5bad0e65684b16964e559bc5c93b4c0ea89'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Shared surfaces (expense payer chip, settle-up transfers, split roster, account menu, home title) only show the plain `@alias` text; there is no visual identity, making it slower to scan who's who.

**Approach:** Let users upload an optional profile photo (Account Menu, and the post-signup Alias Setup screen), stored as a base64 data URI on the user record and surfaced everywhere `alias` currently is. Users without a photo get a colored initials-circle (first letter of alias, one of 4 fixed palette colors chosen deterministically per user, text shade auto-picked for contrast). Hovering any avatar shows the alias as a tooltip (native `title` attribute — no tooltip library exists yet).

## Boundaries & Constraints

**Always:**
- Client resizes/crops the photo to a 256x256 square and caps output near 200KB *before* upload (canvas-based, no new frontend dependency).
- Backend validates the uploaded string: must decode as valid base64, must start with a `data:image/(png|jpeg);base64,` prefix, decoded byte length capped at 300KB. No server-side re-encoding/resizing (no new backend dependency).
- Photo is optional and editable anytime from Account Menu; the Alias Setup screen gets the same optional control for first-time onboarding.
- Palette is exactly `#4E8098 #CBBAED #44344F #F4A261`, chosen deterministically per user (stable hash of `user_id`/`member_id` — same user always gets the same color, no persistence needed for the color itself).
- Text color on the initials circle is computed at render time from the background color's WCAG relative luminance (lighten or darken the same hue until contrast ratio ≥ 4.5:1) — do not hardcode per-color text colors.
- One shared `Avatar` component renders in all 5 target surfaces: `ReceiptRow` payer chip, `SimplifyColumn` settle-up rows, `DefaultSplitPanel` roster, `AccountMenu` (self), `ui/app/home/page.tsx` title prefix.

**Ask First:** none — decisions were resolved during clarification.

**Never:** No cropping UI/editor (resize is automatic, no user-adjustable crop). No separate media storage/CDN/S3 — base64 stays inline in the `users` row and in API responses. No new npm/pip image libraries (Pillow, sharp, browser-image-compression, tooltip libs).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Upload valid photo | User picks a JPEG/PNG < 200KB after client resize | PATCH `/auth/me` succeeds, avatar renders everywhere alias appeared | N/A |
| Oversized/garbage payload | Client sends a string that isn't a valid `data:image/...;base64,` prefix or exceeds 300KB decoded | 422 with `{"detail": ..., "code": "invalid_photo"}` | Form shows inline error, field unchanged |
| No photo set | `photo_base64` is null | Renders initials circle: first alias char uppercased, deterministic palette color, auto-contrast text | N/A |
| Remove photo | User clears the photo control | PATCH `/auth/me` with `photo_base64: null` clears the column, falls back to initials circle | N/A |
| Hover any avatar | Mouse over avatar (photo or initials) | Native tooltip shows the alias | N/A |

</frozen-after-approval>

## Code Map

- `api/adapters/persistence/models.py` -- add `photo_base64: Mapped[str | None]` (Text) to `UserModel`
- `api/adapters/persistence/migrations/versions/0034_user_photo.py` -- new nullable column migration
- `api/api/schemas/auth.py` -- `MeResponse`/`PatchMeBody` gain `photo_base64: str | None`
- `api/api/routes/auth.py:244-327` (`patch_current_user`) -- apply photo field, mirror the alias field's typed-error → JSONResponse pattern
- `api/api/schemas/lists.py` -- `ListMemberItem` (32-35), `TransferResponse` (186-190, add `from_photo_base64`/`to_photo_base64`), `PairwiseEdgeResponse` (143-146) gain photo field(s) alongside alias
- `ui/components/Avatar.tsx` (new) -- shared component: photo `<img>` or initials circle + native `title` tooltip
- `ui/lib/avatarColor.ts` (new) -- deterministic hash → palette color + WCAG contrast text color
- `ui/lib/imageEncode.ts` (new) -- canvas resize/crop to 256x256 + base64 encode, used by both upload sites
- `ui/app/alias/AliasSetupForm.tsx` -- add optional photo picker using `imageEncode.ts`
- `ui/components/AccountMenu.tsx` -- add photo upload/remove control + self avatar display
- `ui/components/soft-ledger/ReceiptRow.tsx` (`OriginPayerAlias`, ~line 73) -- render `Avatar` instead of `@alias` text
- `ui/app/lists/SimplifyColumn.tsx` (26-51) -- render `Avatar` for from/to
- `ui/app/lists/DefaultSplitPanel.tsx` (~line 32) -- render `Avatar` for roster members
- `ui/app/home/page.tsx` -- capture `requireAlias` return value, render `Avatar` before the `<h1>` title

## Tasks & Acceptance

**Execution:**
- [x] `api/adapters/persistence/migrations/versions/0034_user_photo.py` -- add nullable `photo_base64` TEXT column to `users` -- storage for the feature
- [x] `api/adapters/persistence/models.py` -- add `photo_base64` mapped column -- ORM parity with migration
- [x] `api/api/schemas/auth.py` -- add `photo_base64: str | None` to `MeResponse` and `PatchMeBody` (`Field(default=None)`) -- wire contract
- [x] `api/domain/photo.py` (new) -- `validate_photo(value: str | None)` raising `InvalidPhotoError` on bad prefix/oversize; mirrors `api/domain/alias.py` shape -- centralizes the validation rule from the I/O matrix
- [x] `api/api/routes/auth.py` -- apply photo validation/assignment in `patch_current_user`, catch `InvalidPhotoError` → 422 `{"detail":..., "code":"invalid_photo"}` -- matches existing alias error pattern
- [x] `api/api/schemas/lists.py` -- add photo field(s) to `ListMemberItem`, `TransferResponse`, `PairwiseEdgeResponse` -- exposes photo to roster/settle-up DTOs
- [x] wherever those DTOs are constructed (roster/settle-up query services) -- populate the new photo field(s) from the joined `UserModel` -- data actually reaches the DTO
- [x] `ui/lib/avatarColor.ts` -- `pickAvatarColor(seed: string)` and `pickTextColor(bgHex: string)` (WCAG contrast) -- deterministic color + Always-tier contrast rule
- [x] `ui/lib/imageEncode.ts` -- `encodeAvatarPhoto(file: File): Promise<string>` canvas resize to 256x256, JPEG/PNG output capped ~200KB -- shared client-side prep for both upload sites
- [x] `ui/components/Avatar.tsx` -- render photo or initials circle, `title={alias}` for hover tooltip -- single reusable component per Always-tier rule
- [x] `ui/app/alias/AliasSetupForm.tsx` -- add optional file input + preview, call photo PATCH alongside/after alias PATCH -- onboarding entry point
- [x] `ui/components/AccountMenu.tsx` -- add upload/remove control + self `Avatar` -- ongoing edit entry point
- [x] `ui/components/soft-ledger/ReceiptRow.tsx`, `ui/app/lists/SimplifyColumn.tsx`, `ui/app/lists/DefaultSplitPanel.tsx`, `ui/app/home/page.tsx` -- swap `@alias` text / static title for `Avatar` -- the 5 target surfaces from clarification
- [x] unit tests for `avatarColor.ts` (deterministic + contrast ratio ≥4.5) and `api/domain/photo.py` (valid/oversized/bad-prefix cases from the I/O matrix)

**Acceptance Criteria:**
- Given a user with no photo, when any of the 5 surfaces render their alias, then an initials circle in a deterministic palette color with auto-contrast text is shown instead of plain text.
- Given a user uploads a valid photo from Account Menu or Alias Setup, when saved, then all 5 surfaces show that photo, and hovering it shows the alias via native tooltip.
- Given an oversized or malformed photo payload reaches the API, when `PATCH /auth/me` is called, then it returns 422 with `code: "invalid_photo"` and the stored value is unchanged.

## Design Notes

Contrast algorithm: convert the background hex to HSL, compute WCAG relative luminance; if luminance is high, darken lightness in steps until the sRGB contrast ratio against a near-white/near-black text candidate reaches ≥4.5:1, otherwise lighten. Keep this in `pickTextColor` as a small pure function so it's unit-testable without a DOM/canvas.

Seed for color hashing: use `user_id` where available (Account Menu, home, roster with `user_id`); fall back to `member_id` for `TransferResponse`/`PairwiseEdgeResponse` where only membership ids are present — either is stable per person so this is acceptable.

## Verification

**Commands:**
- `cd api && pytest` -- expected: new `photo.py` domain tests and `patch_current_user` photo-path tests pass
- `cd ui && npm run lint && npm test` -- expected: `avatarColor.test.ts` passes, no lint errors in new components

**Manual checks (if no CLI):**
- Sign up a fresh user, skip photo, verify initials circle appears with readable text in both light and dark theme across all 5 surfaces.
- Upload a photo from Account Menu, confirm it appears immediately in Home title, then check ReceiptRow/SimplifyColumn/DefaultSplitPanel in a shared list with another member.

## Suggested Review Order

**Validation & size limits**

- Entry point — the shape and size rules every photo must clear before it's stored.
  [`photo.py:22`](../../api/domain/photo.py#L22)

- Cheap encoded-length check runs before base64 decode, closing a memory/CPU-cost gap review caught.
  [`photo.py:35`](../../api/domain/photo.py#L35)

- Wide wire bound as a first line of defense, mirroring the alias field's pattern.
  [`auth.py:63`](../../api/api/schemas/auth.py#L63)

**Storage & API wiring**

- New nullable column backing the feature — no separate media storage.
  [`models.py:38`](../../api/adapters/persistence/models.py#L38)

- Migration chained after the latest budget-attribution revision.
  [`0034_user_photo.py:17`](../../api/adapters/persistence/migrations/versions/0034_user_photo.py#L17)

- `clear_photo` flag disambiguates an explicit `null` (clear) from an absent field (untouched), since `PatchMeBody`'s bare `str | None` can't otherwise tell them apart.
  [`auth.py:257`](../../api/api/routes/auth.py#L257)

- `InvalidPhotoError` → 422 `invalid_photo`, matching the existing alias error pattern.
  [`auth.py:309`](../../api/api/routes/auth.py#L309)

**Color & contrast (initials fallback)**

- Deterministic seed → one of the 4 palette colors, stable per user with no color persisted.
  [`avatarColor.ts:23`](../../ui/lib/avatarColor.ts#L23)

- WCAG contrast search picks the text shade at render time — no hardcoded per-color text.
  [`avatarColor.ts:112`](../../ui/lib/avatarColor.ts#L112)

**Avatar component & upload prep**

- Single shared component: photo `<img>` or initials circle, falls back to initials if the photo fails to load, native `title` tooltip on both branches.
  [`Avatar.tsx:38`](../../ui/components/Avatar.tsx#L38)

- Client-side resize/crop to 256x256, capped near 200KB before it ever reaches the wire.
  [`imageEncode.ts:61`](../../ui/lib/imageEncode.ts#L61)

**Upload entry points**

- Onboarding: alias claim (required) happens once, then photo save is retried/surfaced independently rather than silently discarded.
  [`AliasSetupForm.tsx:61`](../../ui/app/alias/AliasSetupForm.tsx#L61)

- Ongoing edit: upload/remove control plus self avatar in the Account Menu.
  [`AccountMenu.tsx:171`](../../ui/components/AccountMenu.tsx#L171)

**Display surfaces (alias text → Avatar)**

- Home page title now prefixed with the signed-in user's avatar.
  [`page.tsx:72`](../../ui/app/home/page.tsx#L72)

- Expense payer chip.
  [`ReceiptRow.tsx:89`](../../ui/components/soft-ledger/ReceiptRow.tsx#L89)

- Settle-up suggested-transfer rows (from/to).
  [`SimplifyColumn.tsx:26`](../../ui/app/lists/SimplifyColumn.tsx#L26)

- Default-split member roster.
  [`PercentageSplitTrack.tsx:257`](../../ui/app/lists/PercentageSplitTrack.tsx#L257)

**Tests**

- Domain validation matrix, including the empty-payload and oversized-before-decode edge cases.
  [`test_photo_domain.py:1`](../../api/tests/test_photo_domain.py#L1)

- Route-level round-trip, clear, and 422 cases (integration; skips without `DATABASE_URL`).
  [`test_photo_api.py:1`](../../api/tests/test_photo_api.py#L1)

- Determinism and ≥4.5:1 contrast for the fixed palette.
  [`avatarColor.test.ts:1`](../../ui/lib/avatarColor.test.ts#L1)

