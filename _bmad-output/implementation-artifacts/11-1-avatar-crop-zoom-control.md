# Story 11.1: Avatar crop & zoom control

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user uploading a profile photo (from Account Menu or Alias Setup),
I want to position and zoom the image before it's saved,
so that my avatar isn't limited to an automatic center-crop that may cut off the part of the photo I want.

## Acceptance Criteria

1. **Given** the user selects an image file from either the Account Menu photo control or the Alias Setup photo control, **when** the file is read successfully, **then** a `Sheet` (`ui/app/lists/Sheet.tsx` — not a modal) opens showing the image in a `react-easy-crop` `Cropper`, `cropShape="round"` (matches the circular `Avatar` preview), with a zoom control.
2. **Given** the crop sheet is open, **when** the user drags to reposition or adjusts zoom, **then** the crop preview updates live; no network call and no alias-claim/photo PATCH is made yet.
3. **Given** the user has adjusted crop/zoom, **when** they activate the sheet's corner action (`FormIconSubmit`, `variant="save"` — icon-only, matching `BudgetUpdateForm.tsx`'s convention; **not** a text "Guardar"/"Cancelar" button pair), **then** the cropped area is rendered to a 256×256 canvas and encoded/size-capped exactly as today (JPEG quality step-down to ≤200KB, PNG-with-transparency exception preserved), the sheet closes, and the resulting data URI is handed to the calling surface (Account Menu PATCHes `/api/auth/me` immediately; Alias Setup stores it in local state until form submit, unchanged from today's `photoBase64` state flow).
4. **Given** the crop sheet is open, **when** the user activates the sheet's default close control (X) or the backdrop, **then** the sheet closes, nothing is saved/PATCHed, and the file input is reset — equivalent to today's do-nothing cancel.
5. **Given** the encode/PATCH (Account Menu) or encode (Alias Setup) step fails, **when** the error returns, **then** the existing error messaging is shown (`t.photoError` in Account Menu / `messages.errorPhotoInvalid` in Alias Setup), unchanged from current behavior.
6. **Given** `imageEncode.ts`'s existing size-capping/encode logic, **when** this story is implemented, **then** that logic (JPEG quality step-down loop, PNG-transparency exception, `decodedByteLength` cap) is reused as-is — only the crop-source rectangle changes, from an always-centered square to the `Area` (`{x, y, width, height}`) that `react-easy-crop` reports via its `onCropComplete` callback.
7. **Given** both Account Menu and Alias Setup need the same crop sheet, **when** this story is implemented, **then** the crop `Sheet` + `Cropper` wiring is built once as a shared component (not duplicated in both call sites) and imported by both `AccountMenu.tsx` and `AliasSetupForm.tsx`.

## Tasks / Subtasks

- [ ] Task 1 — Add dependency (AC: #1)
  - [ ] `cd ui && npm i react-easy-crop`; confirm no peer-dep conflict with React 19.2.4 / Next 16.2.12 (`npm i` clean, no `--force`/`--legacy-peer-deps` needed — if one is needed, stop and report before proceeding, don't silently paper over it)

- [ ] Task 2 — Refactor `ui/lib/imageEncode.ts` to accept a user-chosen crop area (AC: #3, #6)
  - [ ] Keep `loadImage`, `canvasToDataUri`, `decodedByteLength` unchanged
  - [ ] Replace `drawSquare(img)` (which always center-crops) with a function that draws a caller-supplied source rectangle — e.g. `drawCroppedSquare(img: HTMLImageElement, area: { x: number; y: number; width: number; height: number })` — onto the same 256×256 canvas via `ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, AVATAR_SIZE, AVATAR_SIZE)`
  - [ ] Export a new entry point, e.g. `encodeCroppedAvatar(img: HTMLImageElement, area: Area, mimeType: string): Promise<string>`, reusing the exact same JPEG-quality-step-down / PNG-transparency-exception logic that `encodeAvatarPhoto` has today (lines 61-79) — do not duplicate that loop, extract/share it
  - [ ] Decide whether `encodeAvatarPhoto(file: File)` (the old auto-center entry point) stays exported for any other caller, or is fully replaced — grep the repo for other importers before removing it (currently only `AccountMenu.tsx` and `AliasSetupForm.tsx` import it, both of which this story changes — if no other caller exists after this story, remove the now-dead auto-center path rather than leaving unused code)

- [ ] Task 3 — Build the shared crop-sheet component (AC: #1, #2, #3, #4, #7)
  - [ ] New file, e.g. `ui/components/AvatarCropSheet.tsx` — accepts the picked `File`, an `open`/`onClose` pair, and an `onConfirm(dataUri: string)` callback
  - [ ] Load the file into an `HTMLImageElement` (reuse `loadImage` from `imageEncode.ts` — export it if it isn't already, or move it somewhere both this component and `imageEncode.ts` can use without a circular import)
  - [ ] Render `Sheet` from `ui/app/lists/Sheet.tsx` with: `body` = `react-easy-crop`'s `<Cropper image={objectUrl} crop={crop} zoom={zoom} cropShape="round" aspect={1} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)} />`; `cornerAction` = `<FormIconSubmit type="button" variant="save" label={<crop-confirm i18n key>} onClick={onConfirm} disabled={!croppedAreaPixels} />`; leave `closeButton`/`onClose` as `Sheet`'s defaults (no custom Cancelar button)
  - [ ] `react-easy-crop` needs a sized container — give the `Cropper`'s wrapping div `position: relative` and an explicit height inside the sheet body (the library requires this; check its docs/README for the minimal required CSS — a bare `<Cropper>` with no positioned/sized parent renders nothing)
  - [ ] On confirm: call `encodeCroppedAvatar(img, croppedAreaPixels, file.type === "image/png" ? "image/png" : "image/jpeg")`, then `onConfirm(dataUri)`, then close the sheet
  - [ ] On close/cancel: revoke any `URL.createObjectURL` used for the image preview (avoid a memory leak — mirrors the `loadImage` cleanup pattern already in `imageEncode.ts`)

- [ ] Task 4 — Wire into `AccountMenu.tsx` (AC: #1, #3, #4, #5)
  - [ ] Replace the current `onPhotoChange` (line 159-171) body: instead of calling `encodeAvatarPhoto` + `savePhoto` directly, store the picked `File` in state and open `AvatarCropSheet`
  - [ ] `AvatarCropSheet`'s `onConfirm` calls the existing `savePhoto(dataUri)` (keep that function as-is — it already does the PATCH + `refresh()` + error handling)
  - [ ] Cancel/close: just close the sheet, no state to revert (nothing was saved yet)
  - [ ] The file `<input>` (currently inline in the `<label>` at line 234-240) still opens the OS file picker as today; only what happens *after* a file is picked changes

- [ ] Task 5 — Wire into `AliasSetupForm.tsx` (AC: #1, #3, #4, #5, #7)
  - [ ] Replace `onPhotoChange` (line 42-52): instead of calling `encodeAvatarPhoto` directly into `photoBase64` state, store the picked `File` and open the same `AvatarCropSheet`
  - [ ] `onConfirm` sets `photoBase64` state exactly as today (line 48) — the rest of the submit flow (`setPhoto` call inside `onSubmit`, line 75-84) is unchanged
  - [ ] This form has no chrome header (it's a plain onboarding page) — confirm `Sheet` still renders correctly with `fillBelowChrome` left at its default (`false`); do not pass `fillBelowChrome={true}` here since there's no `[data-app-chrome='header']` to measure against

- [ ] Task 6 — i18n (AC: #1, #3)
  - [ ] `ui/lib/i18n/account.ts`: add EN+ES keys for the crop sheet — title (e.g. `photoCropTitle`), corner-action label (e.g. `photoCropSave`) — both locales, both files' `en`/`es` blocks kept in sync (existing convention, see file structure)
  - [ ] `ui/lib/i18n/alias.ts`: add the same crop-sheet keys to `aliasMessages` (both `en`/`es`) — do not reuse `accountMessages` here, `AliasSetupForm` only imports `AliasMessages`/`aliasMessages` today, keep that boundary
  - [ ] If the shared `AvatarCropSheet` component takes copy as props (recommended, keeps it presentation-only) rather than importing an i18n module itself, both call sites pass their own locale-resolved strings — avoids the component needing to know which i18n domain it's in

- [ ] Task 7 — Tests (AC: all)
  - [ ] No existing test file covers photo upload in `AccountMenu.test.tsx` or for `AliasSetupForm` — this story is not obligated to retrofit full coverage (per project-context: "UI: test-after," don't invent a coverage floor that wasn't there), but must add tests scoped to what it changes:
    - `imageEncode.ts` has **no existing test file** — add one covering the new `encodeCroppedAvatar`/`drawCroppedSquare` path: a given `Area` produces a canvas draw with those exact source coordinates (mock/spy `ctx.drawImage`), and the JPEG quality step-down / PNG-cap behavior still works when driven through the new entry point
    - `AccountMenu.test.tsx`: add a test that picking a file opens the crop sheet, and confirming it triggers the same `PATCH /api/auth/me` call shape as today's `fetchMock.toHaveBeenCalledWith(...)` assertions elsewhere in that file (mock `react-easy-crop`'s `Cropper` — it needs `ResizeObserver`/canvas APIs jsdom doesn't provide; stub it the way this file already stubs `matchMedia`/`fetch`)
    - A minimal `AliasSetupForm` test for the same open-sheet → confirm → state-set path, if no test file exists yet for that component, add one scoped to just this behavior (don't retrofit the rest of the form)

## Dev Notes

- **Frozen spec renegotiated:** `_bmad-output/implementation-artifacts/spec-profile-photo-avatar.md` (`status: done`) explicitly forbade a crop UI. Sebas renegotiated this via Sprint Change Proposal `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-23.md`; the spec's "Never" line has already been amended (2026-09-23) to carve out this one exception. Everything else in that spec (256×256 output, ~200KB cap, `PATCH /auth/me` contract, no backend image library) is unchanged and must still hold.
- **No modal — reuse `Sheet`.** Sebas was explicit: do not introduce a new overlay/modal pattern. Use `ui/app/lists/Sheet.tsx` exactly as `ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx` does (see its `<Sheet cornerAction={<FormIconSubmit .../>} .../>` around line 188-232 for the exact convention to mirror).
- **No text Cancel/Save buttons.** Sebas explicitly rejected a Cancelar/Guardar footer — use `Sheet`'s `cornerAction` slot with `FormIconSubmit` (icon-only, `variant="save"`) for confirm, and `Sheet`'s own default `closeButton`/backdrop for cancel. Do not add a `footer` prop to `Sheet` for this.
- **Two call sites, one component.** `AccountMenu.tsx` (`ui/components/AccountMenu.tsx`) and `AliasSetupForm.tsx` (`ui/app/alias/AliasSetupForm.tsx`) both currently call `encodeAvatarPhoto` directly with no crop step. Both need the crop sheet; build it once and import it from both — do not duplicate the `Cropper`/`Sheet` wiring.
- **`react-easy-crop` needs sizing CSS.** It renders into a container it expects to be `position: relative` with a real height — a naive drop-in inside `Sheet`'s `body` slot without that will render blank. Check the library's own docs for its minimal CSS requirement before wiring it up.
- **`AliasSetupForm` has no chrome header.** It's a plain full-page onboarding form (`ui/app/signup/signup.module.scss` styling, no `AppShell`/chrome). `Sheet`'s `fillBelowChrome` prop measures `[data-app-chrome='header']` — that selector won't exist on this page, so leave `fillBelowChrome` at its default (`false`); `Sheet` already handles the "no header" case via `FILL_BELOW_CHROME_FALLBACK`, but simplest is to just not opt in here.
- **Money/domain rules do not apply** — this is presentation-only, client-side, no `Decimal`/API-DTO concerns. Standard TS/React rules from project-context still apply (strict TS, no `any`, i18n via per-domain TS message objects — not JSON).
- **Existing size-capping logic is the one piece to preserve exactly**, not reinvent: JPEG quality starts at 0.9, steps down by 0.1 to a floor of 0.4 until the decoded byte length clears 200KB; PNG stays PNG only if it's already under the cap. This is proven logic from the shipped feature — only the *source rectangle* fed into the canvas draw changes.

### Project Structure Notes

- New component: `ui/components/AvatarCropSheet.tsx` (co-located `.module.scss` only if custom styles are truly needed beyond Tailwind utilities — per AD-23, Tailwind first)
- Modified: `ui/lib/imageEncode.ts`, `ui/components/AccountMenu.tsx`, `ui/app/alias/AliasSetupForm.tsx`, `ui/lib/i18n/account.ts`, `ui/lib/i18n/alias.ts`, `ui/package.json`
- No backend changes. No new route, no new API contract, no migration.
- No epic previously owned this surface; this story is filed under new **Epic 11** (added to `epics.md` and `sprint-status.yaml` by the same Sprint Change Proposal that produced this story), not shoehorned into Epic 1 or elsewhere.

### References

- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-09-23.md] — full impact analysis and rationale for this change
- [Source: _bmad-output/implementation-artifacts/spec-profile-photo-avatar.md] — frozen original intent for the profile-photo feature; §Boundaries "Never" line amended 2026-09-23
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 11] — epic/story definition this file elaborates
- [Source: ui/lib/imageEncode.ts] — existing encode/size-cap logic to preserve
- [Source: ui/components/AccountMenu.tsx:159-171,213-253] — current upload flow to replace
- [Source: ui/app/alias/AliasSetupForm.tsx:42-52,125-148] — second upload entry point, currently missed by nothing else in the codebase but easy to miss in scope — do not skip it
- [Source: ui/app/lists/Sheet.tsx] — sheet primitive to reuse, unmodified
- [Source: ui/app/budgets/[budgetId]/BudgetUpdateForm.tsx:188-232] — reference implementation of the `Sheet` + `FormIconSubmit` corner-action convention to mirror
- [Source: ui/components/FormIconSubmit/FormIconSubmit.tsx] — corner-action button component, `variant="save"`
- [Source: ui/components/Avatar.tsx] — renders `photoBase64` as a rounded/`object-cover` image; crop output must stay compatible (256×256 square data URI)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
