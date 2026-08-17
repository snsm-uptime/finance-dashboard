"""Ledger-row line-type taxonomy (Story 4.4, FR-32) — single source of truth.

Consolidates the line-type vocabulary previously duplicated as bare string
literals in domain/expenses.py and domain/settle.py.
"""

from __future__ import annotations

LINE_TYPE_PURCHASE = "purchase"
LINE_TYPE_PAYMENT = "payment"
LINE_TYPE_INTEREST = "interest"
LINE_TYPE_FEE = "fee"
LINE_TYPE_VOLUNTARY_SERVICE = "voluntary_service"
LINE_TYPE_CREDIT_NOTE = "credit_note"
LINE_TYPE_INSTALLMENT_SCHEDULE = "installment_schedule"
LINE_TYPE_BALANCE_FORWARD = "balance_forward"
LINE_TYPE_OTHER = "other"
LINE_TYPE_CLASSIFIED_PURCHASE_REVERSAL = "classified_purchase_reversal"

LINE_TYPES = frozenset(
    {
        LINE_TYPE_PURCHASE,
        LINE_TYPE_PAYMENT,
        LINE_TYPE_INTEREST,
        LINE_TYPE_FEE,
        LINE_TYPE_VOLUNTARY_SERVICE,
        LINE_TYPE_CREDIT_NOTE,
        LINE_TYPE_INSTALLMENT_SCHEDULE,
        LINE_TYPE_BALANCE_FORWARD,
        LINE_TYPE_OTHER,
        LINE_TYPE_CLASSIFIED_PURCHASE_REVERSAL,
    }
)
