# Line types and settle-up inclusion

Companion to `SPEC.md` CAP-11 / CAP-12. Downstream must treat this catalog as part of the contract.

## Taxonomy (minimum)

| `line_type` | Notes |
| --- | --- |
| `purchase` | Splittable when included |
| `payment` | Stored; excluded from settle-up |
| `interest` | Stored; excluded |
| `fee` | Stored; excluded |
| `voluntary_service` | Stored; excluded |
| `credit_note` | Excluded until explicitly classified as purchase reversal |
| `installment_schedule` | Distinct record; excluded; must not double-count with purchase principal |
| `balance_forward` | Ignore or metadata-only |
| `other` | Excluded unless explicitly classified into an included type |
| Inter-member transfer type | Required in taxonomy so statement transfers can be stored without feeding settle allocations (v1 records no payments) |

## What feeds settle-up

**Include:** `purchase` lines; purchase reversals/refunds once a `credit_note` (or equivalent) is explicitly classified as a purchase reversal.

**Exclude:** `payment`, `interest`, `fee`, `voluntary_service`, `credit_note` (until classified), `installment_schedule`, `balance_forward`, and `other` unless classified into an included type.

Non-included types may still import into the ledger for completeness.

## Section policy

Each bank section maps to the taxonomy with policy `must_parse`, `best_effort`, or `ignore`. Unmapped sections default to **best-effort quarantine**, not silent drop.

## CanonicalLine (minimum fields)

Staging and ledger share: `posted_date` (ISO-8601), signed `amount`, ISO 4217 `currency`, `product_id`, `line_type`, `external_ref` when provided, `normalized_description`, `provenance` (`parser` | `hand`). Non-CRC commits also materialize `amount_crc`, `fx_rate`, `fx_rate_date`, `fx_fallback`.

## Identity

- **Primary:** stable bank `external_ref` when adapter marks ref quality stable (with `product_id` scope).
- **Fallback:** `(product_id, posted_date, currency, amount, normalized_description, line_type, statement_period_id)`.
- Domain alone computes identity at commit. Adapters may hint `ref_quality` only.

## BAC credit baseline

| Bank section | Taxonomy | v1 policy |
| --- | --- | --- |
| Detalle de compras | purchase | must_parse |
| Detalle de pago | payment | must_parse |
| Detalle de intereses | interest | must_parse |
| Otros cargos | fee | must_parse |
| Productos y servicios de elección voluntaria | voluntary_service | best_effort |
| Collection / credit notes | credit_note / fee | best_effort until classified |
| Otras líneas de financiamiento | installment_schedule | must_parse on credit |
| Saldo Anterior | balance_forward | ignore or metadata-only |

Additional owner-labeled sample layouts (eco, dolares, colones) remain provisional until fixture review against real statements — then the same acceptance bar applies. Labels are user card names for IBAN accounts, not a closed product enum.

## Dual-column amounts

Collapse to a single `(currency, amount)` before identity: prefer the nonzero column; if both nonzero, prefer CRC.
