# Auth email token claim pattern (Epic 2 invite reuse)

**Story:** 1.5.1 · **AD-8 addendum** · **Helper:** `api/adapters/persistence/token_claim.py`

Single-use email tokens (password reset, email verify, **future list invites**) share one claim contract:

1. **Hash at rest** — store SHA-256 (or equivalent) of the raw token; never persist the raw value.
2. **TTL on create** — set `expires_at = now + TTL` when inserting the row.
3. **Atomic claim** — consume with a single `UPDATE` that requires **all** of:
   - matching token `id` (or equivalent PK)
   - `used_at IS NULL`
   - `expires_at > now` (timezone-aware UTC)
4. **Success** = `rowcount > 0`. Failure returns false and **must not** set `used_at` on an expired row.
5. **Separate table per token type** — do not overload reset/verify rows for invites; reuse the **helper**, not the table.
6. **Application pre-check** (compare `expires_at` in Python before claim) is optional defense-in-depth. The claim MUST NOT succeed solely because a row matched.

## Copy-paste for invite tokens

```python
from adapters.persistence.token_claim import claim_single_use_email_token

def claim_token(self, token_id: UUID, *, used_at: datetime) -> bool:
    return claim_single_use_email_token(
        self._session,
        ListInviteTokenModel,  # your Epic 2 model
        token_id,
        used_at=used_at,
    )
```

Do **not** implement:

```python
# WRONG — missing expires_at (the 1.4/1.5 gap)
.where(Model.id == token_id, Model.used_at.is_(None))
```
