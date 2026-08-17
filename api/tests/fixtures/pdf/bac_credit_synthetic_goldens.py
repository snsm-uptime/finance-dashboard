"""Expected CanonicalLine rows for bac_credit_synthetic.pdf (Story 4.4, Task 5.5).

Seed for Story 4.5's official CI acceptance-bar golden test — kept minimal
and correct, not exhaustive. Statement chunk 2 (index 2) is intentionally
not represented here: its lone row sits under an unmapped section and is
expected to raise InvalidCanonicalLineError, not produce rows (see
test_bac_adapter.py).

Sign convention: purchases/fees/interest/installment_schedule/
voluntary_service are positive charges; payments are negative
(balance-reducing) — see adapter.py's _NEGATIVE_LINE_TYPES.
"""

from __future__ import annotations

from decimal import Decimal

STATEMENT_1_GOLDENS: list[dict[str, object]] = [
    {
        "posted_date": "2026-01-05",
        "amount": Decimal("10500.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "purchase",
        "normalized_description": "SUPERMERCADO XYZ",
    },
    {
        "posted_date": "2026-01-07",
        "amount": Decimal("45.00"),
        "currency": "USD",
        "product_id": "bac_credit",
        "line_type": "purchase",
        "normalized_description": "AMAZON US",
    },
    {
        "posted_date": "2026-01-09",
        "amount": Decimal("8250.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "purchase",
        "normalized_description": "FARMACIA CENTRAL",
    },
    {
        "posted_date": "2026-01-10",
        "amount": Decimal("-50000.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "payment",
        "normalized_description": "PAGO SINPE MOVIL",
    },
    {
        "posted_date": "2026-01-15",
        "amount": Decimal("3500.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "fee",
        "normalized_description": "CUOTA DE MANEJO",
    },
]

STATEMENT_2_GOLDENS: list[dict[str, object]] = [
    {
        "posted_date": "2026-01-20",
        "amount": Decimal("1200.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "interest",
        "normalized_description": "INTERESES CORRIENTES",
    },
    {
        "posted_date": "2026-01-22",
        "amount": Decimal("2000.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "voluntary_service",
        "normalized_description": "SEGURO TARJETA",
    },
    {
        "posted_date": "2026-01-25",
        "amount": Decimal("15000.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "installment_schedule",
        "normalized_description": "CUOTA FINANCIAMIENTO TV",
    },
]
