"""Expected CanonicalLine rows for bac_credit_synthetic.pdf (Story 4.4, Task 5.5).

Seed for Story 4.5's official CI acceptance-bar golden test — kept minimal
and correct, not exhaustive. Statement chunk 2 (index 2) is intentionally
not represented here: its lone row sits under an unmapped section and is
expected to raise InvalidCanonicalLineError, not produce rows (see
test_bac_adapter.py).

Sign convention: purchases/fees/interest/installment_schedule/
voluntary_service are positive charges; payments are negative
(balance-reducing) — see adapter.py's _NEGATIVE_LINE_TYPES.

Interest rows have no printed date; posted_date is the fixture PDF's
/CreationDate (2026-01-31).
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
        "normalized_description": "100001 SUPERMERCADO XYZ SAN JOSE",
    },
    {
        "posted_date": "2026-01-07",
        "amount": Decimal("45.00"),
        "currency": "USD",
        "product_id": "bac_credit",
        "line_type": "purchase",
        "normalized_description": "100002 AMAZON US MIAMI",
    },
    {
        "posted_date": "2026-01-09",
        "amount": Decimal("8250.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "purchase",
        "normalized_description": "100003 FARMACIA CENTRAL SAN JOSE",
    },
    {
        "posted_date": "2026-01-10",
        "amount": Decimal("-50000.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "payment",
        "normalized_description": "100004 PAGO SINPE MOVIL SAN JOSE",
    },
    {
        "posted_date": "2026-01-15",
        "amount": Decimal("3500.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "fee",
        "normalized_description": "100005 CUOTA DE MANEJO SAN JOSE",
    },
]

STATEMENT_2_GOLDENS: list[dict[str, object]] = [
    {
        "posted_date": "2026-01-31",
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
        "normalized_description": "100006 SEGURO TARJETA SAN JOSE",
    },
    {
        "posted_date": "2026-01-25",
        "amount": Decimal("15000.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "installment_schedule",
        "normalized_description": "100007 CUOTA FINANCIAMIENTO TV SAN JOSE",
    },
]
