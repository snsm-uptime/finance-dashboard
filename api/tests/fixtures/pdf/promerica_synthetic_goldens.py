"""Expected CanonicalLine rows for promerica_synthetic.pdf (Story 4.9.2, Task 5.5).

Covers every MUST_PARSE/BEST_EFFORT section of the real Promerica credit-card
layout: payments (4-amount-column rows, transaction columns only), purchases
(2-amount-column, incl. a leading-minus refund), interest (two-line
concept/amount pairing, incl. a negative reversal), other charges,
voluntary-service. The IGNORE section ("Cargos por gestión evidenciable de
cobro**") is empty in the fixture, matching the real sample.

Sign convention: payment amounts already carry their sign from the printed
text (leading minus) — unlike BAC credit, no forced negation is applied.
Purchase/fee/voluntary-service amounts are whatever `normalize_dual_column_amount`
resolves (a purchase refund prints its own leading minus).

Interest rows have no printed date; posted_date is the fixture statement's
printed "Fecha de Corte" cut-off date (2026-01-19) — not PDF /CreationDate,
which pypdfium2's split() overwrites on every chunk.
"""

from __future__ import annotations

from decimal import Decimal

PROMERICA_GOLDENS: list[dict[str, object]] = [
    {
        "posted_date": "2025-12-23",
        "amount": Decimal("-39976.92"),
        "currency": "CRC",
        "product_id": "promerica_credit",
        "line_type": "payment",
        "normalized_description": "PAGO SINPE",
    },
    {
        "posted_date": "2026-01-06",
        "amount": Decimal("-297986.99"),
        "currency": "CRC",
        "product_id": "promerica_credit",
        "line_type": "payment",
        "normalized_description": "PAGO SINPE",
    },
    {
        "posted_date": "2025-12-17",
        "amount": Decimal("2100.00"),
        "currency": "CRC",
        "product_id": "promerica_credit",
        "line_type": "purchase",
        "normalized_description": "PARQUEOS REAL CARIARI BELEN CRI",
    },
    {
        "posted_date": "2026-01-20",
        "amount": Decimal("-30000.00"),
        "currency": "CRC",
        "product_id": "promerica_credit",
        "line_type": "purchase",
        "normalized_description": "BONO DE BIENVENIDA 15,000 San Jose CRI",
    },
    {
        "posted_date": "2026-01-19",
        "amount": Decimal("99.59"),
        "currency": "CRC",
        "product_id": "promerica_credit",
        "line_type": "interest",
        "normalized_description": "MONTO POR INTERESES CORRIENTES",
    },
    {
        "posted_date": "2026-01-19",
        "amount": Decimal("-3564.56"),
        "currency": "CRC",
        "product_id": "promerica_credit",
        "line_type": "interest",
        "normalized_description": "REVERSIÓN DE INTERESES CORRIENTES DEL PERIODO ANTERIOR",
    },
    {
        "posted_date": "2026-01-02",
        "amount": Decimal("760.50"),
        "currency": "CRC",
        "product_id": "promerica_credit",
        "line_type": "fee",
        "normalized_description": "COSTO OPERATIVO POR ADM DE CUENTA SAN JOSE CRI",
    },
    {
        "posted_date": "2026-01-02",
        "amount": Decimal("3400.00"),
        "currency": "CRC",
        "product_id": "promerica_credit",
        "line_type": "voluntary_service",
        "normalized_description": "SEGURO PROTECCIÓN FINANC. TC 1 - SAGICOR SAN JOSE CRI",
    },
]
