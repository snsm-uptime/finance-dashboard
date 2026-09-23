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

# Debit-account (checking) line types (Story 4.9.1) — deliberately distinct
# from the credit-card-specific types above: a debit-account row is money
# leaving (DÉBITOS) or entering (CRÉDITOS) a checking account, which is not
# the same semantics as a card purchase/payment. Not included in
# domain/settle.py's INCLUDED_LINE_TYPES — no settle-math decision has been
# made for debit-account rows yet (this story is adapter-output only).
LINE_TYPE_WITHDRAWAL = "withdrawal"
LINE_TYPE_DEPOSIT = "deposit"

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
        LINE_TYPE_WITHDRAWAL,
        LINE_TYPE_DEPOSIT,
    }
)
