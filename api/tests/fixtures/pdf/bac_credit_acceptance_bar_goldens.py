"""Expected CanonicalLine rows for bac_credit_acceptance_bar.pdf (Story 4.5, Task 2.4).

This is the v1 parsing acceptance bar (AC #1, FR-35): every must-parse row
of the BAC credit baseline section map, run through the real pipeline
(detect_bank_adapter -> BacCreditAdapter.split -> .parse), asserted equal
here with zero manual edits (see test_bac_credit_fixture_acceptance.py).

Saldo Anterior is deliberately excluded — its section policy is "ignore",
so it must produce no CanonicalLine at all.

Sign convention: purchases/interest/fee/voluntary_service/
installment_schedule are positive charges; payments are negative
(balance-reducing) — see adapter.py's _NEGATIVE_LINE_TYPES. Confirmed not
contradicted by a real BAC credit statement recovered locally for this
story's Task 2.1a sanity check (real statements print amounts unsigned in
both sections; the negative-for-payments convention is a software-level
modeling choice, not something the source PDF disputes) — see this story's
Completion Notes.
"""

from __future__ import annotations

from decimal import Decimal

from domain.expenses import PROVENANCE_PARSER

GOLDENS: list[dict[str, object]] = [
    {
        "posted_date": "2026-01-03",
        "amount": Decimal("9750.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "purchase",
        "normalized_description": "200001 FARMACIA CENTRAL SAN JOSE",
        "provenance": PROVENANCE_PARSER,
        "external_ref": None,
        "ref_quality": None,
    },
    {
        "posted_date": "2026-01-04",
        "amount": Decimal("14200.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "purchase",
        "normalized_description": "200002 SUPERMERCADO ABC SAN JOSE",
        "provenance": PROVENANCE_PARSER,
        "external_ref": None,
        "ref_quality": None,
    },
    {
        "posted_date": "2026-01-06",
        "amount": Decimal("72.50"),
        "currency": "USD",
        "product_id": "bac_credit",
        "line_type": "purchase",
        "normalized_description": "200003 AMAZON STORE MIAMI",
        "provenance": PROVENANCE_PARSER,
        "external_ref": None,
        "ref_quality": None,
    },
    {
        "posted_date": "2026-01-08",
        "amount": Decimal("-60000.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "payment",
        "normalized_description": "200004 PAGO SINPE MOVIL SAN JOSE",
        "provenance": PROVENANCE_PARSER,
        "external_ref": None,
        "ref_quality": None,
    },
    {
        "posted_date": "2026-01-31",
        "amount": Decimal("1850.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "interest",
        "normalized_description": "INTERESES CORRIENTES",
        "provenance": PROVENANCE_PARSER,
        "external_ref": None,
        "ref_quality": None,
    },
    {
        "posted_date": "2026-01-12",
        "amount": Decimal("4100.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "fee",
        "normalized_description": "200005 CUOTA DE MANEJO SAN JOSE",
        "provenance": PROVENANCE_PARSER,
        "external_ref": None,
        "ref_quality": None,
    },
    {
        "posted_date": "2026-01-14",
        "amount": Decimal("2300.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "voluntary_service",
        "normalized_description": "200006 SEGURO TARJETA SAN JOSE",
        "provenance": PROVENANCE_PARSER,
        "external_ref": None,
        "ref_quality": None,
    },
    {
        "posted_date": "2026-01-16",
        "amount": Decimal("18500.00"),
        "currency": "CRC",
        "product_id": "bac_credit",
        "line_type": "installment_schedule",
        "normalized_description": "200007 CUOTA FINANCIAMIENTO EQUIPO SAN JOSE",
        "provenance": PROVENANCE_PARSER,
        "external_ref": None,
        "ref_quality": None,
    },
]
