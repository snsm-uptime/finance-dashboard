# Sprint Change Proposal — 2026-09-23

**Author:** Amelia (Developer agent) with Sebas
**Mode:** Incremental

---

## 1. Issue Summary

**Problem statement:** The account-photo upload flow (`ui/components/AccountMenu.tsx` + `ui/lib/imageEncode.ts`) currently performs an **automatic center-square crop** with no user control over position or zoom. This is a known, documented limitation left in the code itself:

> `ui/lib/imageEncode.ts:35` — *"Center-crop to a square before scaling, so the resize never distorts the aspect ratio (no user-adjustable crop — this is automatic)."*

**Discovery context:** Not raised by a specific story failure — surfaced as a UX gap while reviewing the existing (already-shipped) avatar upload feature. This feature was implemented ad hoc and is not tracked by any epic/story in `epics.md` or the PRD.

**Requested change:** Add `react-easy-crop` (npm) so the user can position and zoom the source image before it's committed as their avatar, replacing the automatic center-crop with an interactive one.

**Evidence:** Live code inspected — `AccountMenu.tsx:159-171` (`onPhotoChange` → `encodeAvatarPhoto` → `savePhoto`, no user step in between) and `imageEncode.ts` (`drawSquare` hardcodes the center-crop math).

---

## 2. Impact Analysis

### Epic Impact
**None.** This feature was never tracked as its own epic/story — it shipped as part of Account/preferences work with no dedicated backlog entry. No existing epic's scope, sequencing, or acceptance criteria is affected.

### Story Impact
No existing stories are modified. **One new story is added** (see §4) to formally track this enhancement, since it touches shipped product behavior and needs its own AC/testing record per the project's `story execution` workflow rule (`project-context.md` §"Story execution": path is sprint planning → create story → validate → dev-story).

### Artifact Conflicts
- **PRD:** No conflict. No FR currently references avatar/photo upload; nothing to reconcile.
- **Architecture:** No conflict. The change stays 100% client-side (`ui/` only) — consistent with AD-1 (`ui` → HTTP only, no DB/parsers) and the existing design choice that the backend never needs an image library. The `PATCH /api/auth/me` contract (`photo_base64` field) is unchanged.
- **UI/UX specs:** No formal UX-DR/DESIGN.md/EXPERIENCE.md artifact currently documents avatar upload behavior, so there's no existing spec to reconcile — but the new interaction must follow established in-repo UI conventions (below), since those function as the de facto UX spine for this surface.
- **Other artifacts:** `ui/package.json` gains one new dependency (`react-easy-crop`). i18n (`ui/lib/i18n/account.ts`) needs new EN/ES keys per project-context's i18n rule (per-domain TS message objects, not JSON).

### Technical Impact
- New dependency: `react-easy-crop` (peer-compatible with React 19.2.x / Next 16.2.x — hooks-based, no known React 19 incompatibility, but should be verified with `npm i` + a manual smoke test since it's a third-party lib not yet in the lockfile).
- `imageEncode.ts`: the automatic `drawSquare` (center-crop) path is replaced by a function that accepts `react-easy-crop`'s `croppedAreaPixels` output and does the canvas draw + JPEG/PNG size-capping (200KB target) that already exists today — that sizing logic is reused as-is.
- `AccountMenu.tsx`: `onPhotoChange` changes from "pick file → auto-encode → PATCH" to "pick file → open crop `Sheet` → user adjusts position/zoom → confirm → encode cropped area → PATCH." Cancel closes the sheet with no PATCH call (`savePhoto` only fires on confirm).

---

## 3. Recommended Approach

**Selected: Option 1 — Direct Adjustment** (add one new story within the existing backlog structure; no epic/PRD/architecture rework).

**Rationale:**
- Self-contained, client-only UI change with zero backend or data-model impact.
- No epic currently owns this surface, so there's no resequencing or epic-scope conflict to resolve.
- Effort: **Low** — one component (`AccountMenu.tsx`), one lib file (`imageEncode.ts`), one new dependency, two i18n keys sets.
- Risk: **Low** — reuses the existing `Sheet` pattern (no new overlay primitive), existing `FormIconSubmit` corner-action convention, and existing size-capping logic. The only external risk is `react-easy-crop`'s compatibility with React 19, mitigated by a smoke test after install.
- Timeline impact: negligible — does not block or reorder any planned epic.

---

## 4. Detailed Change Proposals

### New Story: [Epic — Account] Avatar crop & zoom control

**Section:** New story (no existing epic owns Account/profile-photo work; recommend filing under the nearest fitting epic — Sebas to confirm epic number, see §6 below — or as an unassigned backlog item if none fits).

**Story:**
> As a user uploading a profile photo, I want to position and zoom the image before it's saved, so my avatar isn't limited to an automatic center-crop that may cut off the part of the photo I want.

**Acceptance Criteria:**

**Given** the user taps the photo-upload pencil badge on `/account` and selects an image file
**When** the file is read successfully
**Then** a `Sheet` (not a modal — reuses `ui/app/lists/Sheet.tsx`) opens showing the image in a `react-easy-crop` `<Cropper>`, cropShape="round" (matches the circular `Avatar` preview), with a zoom slider/gesture control

**Given** the crop sheet is open
**When** the user drags to reposition or pinches/scrolls to zoom
**Then** the crop preview updates live; no network call is made yet

**Given** the user has adjusted crop/zoom
**When** they tap the corner action (`FormIconSubmit`, `variant="save"` — matches the convention in `BudgetUpdateForm.tsx`)
**Then** the cropped area is rendered to a 256×256 canvas, encoded/size-capped exactly as `encodeAvatarPhoto` does today (JPEG quality step-down to ≤200KB, PNG-with-transparency exception), PATCHed to `/api/auth/me`, and the sheet closes on success

**Given** the crop sheet is open
**When** the user taps the sheet's default close button (X) or the backdrop
**Then** the sheet closes, no PATCH is sent, and the file input is reset (matches current cancel-by-doing-nothing behavior)

**Given** the PATCH fails
**When** the error returns
**Then** the existing `photoError` messaging pattern is shown (reuse `t.photoError`), consistent with current error handling — sheet may stay open or close per existing UX call (to confirm during dev-story if not obvious)

**Technical notes for implementation:**
- `npm i react-easy-crop` in `ui/`
- Reuse `Sheet` exactly as `BudgetUpdateForm.tsx`/`EditExpenseForm.tsx` do: `cornerAction` = `FormIconSubmit` (variant="save"), default `closeButton`/`onClose` for cancel — **no custom Cancelar/Guardar text buttons**
- `imageEncode.ts`: keep the existing size-capping/encode logic (`canvasToDataUri`, `decodedByteLength`, JPEG quality loop) but factor the crop-source rectangle out of `drawSquare` so it accepts `react-easy-crop`'s `Area` (`croppedAreaPixels: {x, y, width, height}`) instead of always computing the center square. Function signature becomes something like `encodeCroppedAvatar(image: HTMLImageElement | File, area: Area): Promise<string>`.
- New i18n keys in `ui/lib/i18n/account.ts` (EN + ES, both required): crop sheet title (e.g. `photoCropTitle`), zoom control label (e.g. `photoZoomLabel`), submit action label (e.g. `photoCropSave` — reuse existing icon-button label convention).
- Component test coverage: extend `ui/components/soft-ledger/...` pattern is N/A here (Account isn't a soft-ledger primitive) — follow whatever existing test file covers `AccountMenu.tsx` today (check for one; if none exists, this story should not be the one to retrofit full coverage — add tests scoped to the new crop-confirm/cancel paths only, per "UI: test-after" discipline in project-context).

**Rationale:** Replaces a known, code-documented UX limitation with user control, reusing 100% existing UI primitives (`Sheet`, `FormIconSubmit`) so no new overlay/button pattern is introduced.

---

## 5. Implementation Handoff

**Change scope classification: Minor.**

- **Route to:** Developer agent (Amelia) — direct implementation, no PO/PM/Architect involvement needed.
- **Deliverables:**
  1. This Sprint Change Proposal (recorded as historical context).
  2. A formal story file via `bmad-create-story` (recommended next step — Sebas to pick which epic this nests under, or file as a standalone backlog item since no current epic owns Account/profile work).
  3. Implementation via `bmad-dev-story` following the story file once created.
- **Success criteria:**
  - User can reposition/zoom before saving an avatar photo.
  - Existing 200KB size cap and JPEG/PNG encode behavior preserved unchanged.
  - No new overlay pattern introduced — `Sheet` + `FormIconSubmit` reused per existing convention.
  - EN/ES i18n complete for all new copy.
  - `npm i react-easy-crop` resolves cleanly against React 19.2.x / Next 16.2.x with no peer-dep warnings blocking install.

---

## 6. Epic Assignment — Resolved

Confirmed by Sebas: filed as a **standalone/unassigned backlog item** (no epic owns Account/profile-photo work). Next step is `bmad-create-story` to produce the formal story file outside any epic grouping, then `bmad-dev-story` to implement.
