# Story 4.8.3 Handoff: Card Identification at Upload

## Current Status
- **Branch:** `ad-hoc/card-iban-identification`
- **Latest Commit:** `99ea0bb` - "feat(frontend): add card_id to upload types"
- **Token Usage:** ~92% (frontend UI work deferred)

## What's Complete ✅

### Backend Implementation (DONE)
1. **Domain Layer:**
   - Added `card_id: UUID | None` to `DetectedStatement`
   - Added `card_id: UUID | None` to `StagedStatementRecord`

2. **Persistence Layer:**
   - Added `card_id` column to `ImportStatementModel` (FK to cards, nullable)
   - Updated record mapping to pass `card_id` through pipeline

3. **Application Layer:**
   - Injected `MatchCardByIbanService` into `UploadStatementPdfService`
   - During upload, for each statement with IBAN:
     - Call `MatchCardByIbanService.execute()` to identify card
     - Store `matched_card.id` in `statement.card_id`

4. **API Layer:**
   - Added `card_id: UUID | None` to `StagedStatementResponse`
   - Updated `_session_response()` to include `card_id` in responses
   - Injected services in upload route handler

5. **Frontend Types:**
   - Updated `StagedStatement` type to include `card_id: string | null`
   - Updated parser and test mocks

### Key Files Modified
- `api/application/import_session.py` - Core logic + restored `AssignIndividualImportService`
- `api/adapters/persistence/models.py` - Added `card_id` column
- `api/adapters/persistence/import_sessions.py` - Updated mapping
- `api/api/routes/import_sessions.py` - Injected services
- `api/api/schemas/import_sessions.py` - Added `card_id` field
- `ui/app/upload/uploadClient.ts` - Updated types
- `ui/app/upload/uploadClient.test.ts` - Updated test mocks

## What's Remaining 📋

### Frontend UI: SessionReviewPanel Component

**Goal:** Show identified cards after upload, before bulk/individual choice

**Create new component:** `ui/app/upload/SessionReviewPanel.tsx`

**Responsibilities:**
1. Display each statement with its identified card:
   - If `card_id` exists: Show card name/label
   - If `card_id` null & `iban` exists: Show "Register card" prompt
   - If no `iban`: Show "No card info"

2. Allow card registration for unknown IBANs:
   - Reuse `useCardIdentification` hook (already exists)
   - Show form to register new card
   - Refresh session after registration

3. Provide navigation:
   - Link to `/upload/bulk/{sessionId}` for bulk review
   - Link to `/upload/review/{sessionId}` for individual review (if re-enabled)

**Integration with UploadPanel:**

Update `ui/app/upload/UploadPanel.tsx`:
- After successful upload, show `SessionReviewPanel` instead of immediate bulk/individual links
- Pass `session` prop to component
- Keep "Discard" button visible

**UI Layout Pattern:**
```
Session Review
├─ Statement 1
│  └─ Card: [Identified Card Name or Register Prompt]
├─ Statement 2
│  └─ Card: [Identified Card Name or Register Prompt]
└─ Actions
   ├─ [Discard]
   ├─ [Go to Bulk Review →]
   └─ [Go to Individual Review →] (if re-enabled)
```

## Current Flow (After This Work)
```
1. User uploads PDF
   ↓
2. Backend detects statements + identifies cards via IBAN
   ↓
3. API returns session with card_id for each statement
   ↓
4. [NEW] SessionReviewPanel shows cards, allows registration
   ↓
5. User chooses bulk or individual review
   ↓
6. Both flows use pre-identified cards (no card selection UI needed)
```

## Testing Checklist
- [ ] UploadPanel renders SessionReviewPanel after upload
- [ ] SessionReviewPanel displays identified cards correctly
- [ ] Card registration works for unknown IBANs
- [ ] Links to bulk/individual review work
- [ ] Discard button still works
- [ ] Session state updates after card registration
- [ ] TypeScript compilation passes
- [ ] UI tests updated if applicable

## Notes
- `useCardIdentification` hook already exists and handles registration
- Card identification logic at upload time means both bulk and individual flows start with card context
- This enables future simplification: remove card selection UI from individual review (Story 4.13+)

## Branch Status
- ✅ All code compiles
- ✅ All tests pass
- ✅ Merged with main (resolved conflicts)
- ⏳ Frontend UI work deferred to next session
