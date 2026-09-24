"""Expected CanonicalLine rows for bac_debit_synthetic.pdf (Story 4.9.1).

Mirrors bac_credit_synthetic_goldens.py's shape. This fixture's single
statement chunk carries three rows: two DÉBITOS-only (withdrawal) and one
CRÉDITOS-present (deposit) — AC #7 requires covering both.

Sign convention: DÉBITOS (money leaving the checking account) is negative;
CRÉDITOS (money entering) is positive — see adapter.py's _NEGATIVE_LINE_TYPES.

Dates have no printed year (`%b/%d`); posted_date's year is resolved from
the fixture's printed `Fecha de Corte: 30/JUN/26` (AD-26 nearest-prior-year
rule against reference_date 2026-06-30).
"""

from __future__ import annotations

from decimal import Decimal

STATEMENT_GOLDENS: list[dict[str, object]] = [
    {
        "posted_date": "2026-05-29",
        "amount": Decimal("-284.26"),
        "currency": "CRC",
        "product_id": "bac_debit",
        "line_type": "withdrawal",
        "normalized_description": "053100000 IVA -UBER *TRIP-HELP.UB",
    },
    {
        "posted_date": "2026-06-01",
        "amount": Decimal("-50000.00"),
        "currency": "CRC",
        "product_id": "bac_debit",
        "line_type": "withdrawal",
        "normalized_description": "000000002 Sobrantesporrefundiciondec",
    },
    {
        "posted_date": "2026-06-02",
        "amount": Decimal("75000.00"),
        "currency": "CRC",
        "product_id": "bac_debit",
        "line_type": "deposit",
        "normalized_description": "000000003 TRANSFERENCIA RECIBIDA",
    },
]
