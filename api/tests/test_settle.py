"""Unit tests for settle-up balance computation (Story 3.4)."""

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from domain.settle import (
    LedgerEntryRecord,
    ListMemberView,
    ShareAllocation,
    compute_settle_balance_for_list_members,
)  # noqa: I001


class MockAllocationResult:
    """Mock allocation result for testing."""

    def __init__(self, allocations):
        self.allocations = allocations


@pytest.fixture
def alice_id():
    return UUID("12345678-1234-5678-1234-567812345678")


@pytest.fixture
def bob_id():
    return UUID("87654321-8765-4321-8765-432187654321")


@pytest.fixture
def charlie_id():
    return UUID("11111111-1111-1111-1111-111111111111")


@pytest.fixture
def list_id():
    return UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


def test_simple_50_50_split_alice_pays(alice_id, bob_id, list_id):
    """Alice pays ₡1000, 50/50 with Bob → Alice: +₡500, Bob: -₡500."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]
    entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    def compute_allocations_fn(
        total,
        currency,
        item_override=None,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=None,
        creator_user_id=None,
        currency_exponent=2,
    ):
        allocations = [
            ShareAllocation(member_id=alice_id, amount=Decimal("500"), currency="CRC"),
            ShareAllocation(member_id=bob_id, amount=Decimal("500"), currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    def get_split_override_fn(entry_id):
        return None

    def get_list_default_split_fn(list_id):
        return None

    balances = compute_settle_balance_for_list_members(
        [entry],
        members,
        alice_id,
        compute_allocations_fn,
        get_split_override_fn,
        get_list_default_split_fn,
        default_mode="even",
    )

    assert balances[alice_id] == Decimal("500")
    assert balances[bob_id] == Decimal("-500")
    assert sum(balances.values(), Decimal("0")) == Decimal("0")


def test_single_payer_single_recipient(alice_id, bob_id, list_id):
    """Single payer, single recipient: Alice pays ₡1000, Bob gets it all."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]
    entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    def compute_allocations_fn(
        total,
        currency,
        item_override=None,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=None,
        creator_user_id=None,
        currency_exponent=2,
    ):
        allocations = [
            ShareAllocation(member_id=bob_id, amount=Decimal("1000"), currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    def get_split_override_fn(entry_id):
        return None

    def get_list_default_split_fn(list_id):
        return None

    balances = compute_settle_balance_for_list_members(
        [entry],
        members,
        alice_id,
        compute_allocations_fn,
        get_split_override_fn,
        get_list_default_split_fn,
        default_mode="even",
    )

    assert balances[alice_id] == Decimal("1000")
    assert balances[bob_id] == Decimal("-1000")


def test_multiple_members_mixed_payers(alice_id, bob_id, charlie_id, list_id):
    """Multiple members with mixed payers and splits."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
        ListMemberView(user_id=charlie_id, alias="Charlie"),
    ]

    entry1 = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    entry2 = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("600"),
        currency="CRC",
        payer_id=bob_id,
        line_type="purchase",
    )

    call_count = 0

    def compute_allocations_fn(
        total,
        currency,
        item_override=None,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=None,
        creator_user_id=None,
        currency_exponent=2,
    ):
        nonlocal call_count
        call_count += 1

        if call_count == 1:
            allocations = [
                ShareAllocation(member_id=alice_id, amount=Decimal("400"), currency="CRC"),
                ShareAllocation(member_id=bob_id, amount=Decimal("300"), currency="CRC"),
                ShareAllocation(member_id=charlie_id, amount=Decimal("300"), currency="CRC"),
            ]
        else:
            allocations = [
                ShareAllocation(member_id=alice_id, amount=Decimal("200"), currency="CRC"),
                ShareAllocation(member_id=bob_id, amount=Decimal("200"), currency="CRC"),
                ShareAllocation(member_id=charlie_id, amount=Decimal("200"), currency="CRC"),
            ]
        return MockAllocationResult(allocations)

    def get_split_override_fn(entry_id):
        return None

    def get_list_default_split_fn(list_id):
        return None

    balances = compute_settle_balance_for_list_members(
        [entry1, entry2],
        members,
        alice_id,
        compute_allocations_fn,
        get_split_override_fn,
        get_list_default_split_fn,
    )

    assert balances[alice_id] == Decimal("400")
    assert balances[bob_id] == Decimal("100")
    assert balances[charlie_id] == Decimal("-500")
    assert sum(balances.values(), Decimal("0")) == Decimal("0")


def test_excluded_line_types_skipped(alice_id, bob_id, list_id):
    """Excluded line types (fee, payment, interest) are skipped."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]

    purchase_entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    fee_entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("100"),
        currency="CRC",
        payer_id=alice_id,
        line_type="fee",
    )

    payment_entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("50"),
        currency="CRC",
        payer_id=bob_id,
        line_type="payment",
    )

    def compute_allocations_fn(
        total,
        currency,
        item_override=None,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=None,
        creator_user_id=None,
        currency_exponent=2,
    ):
        allocations = [
            ShareAllocation(member_id=alice_id, amount=Decimal("500"), currency="CRC"),
            ShareAllocation(member_id=bob_id, amount=Decimal("500"), currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    def get_split_override_fn(entry_id):
        return None

    def get_list_default_split_fn(list_id):
        return None

    balances = compute_settle_balance_for_list_members(
        [purchase_entry, fee_entry, payment_entry],
        members,
        alice_id,
        compute_allocations_fn,
        get_split_override_fn,
        get_list_default_split_fn,
    )

    assert balances[alice_id] == Decimal("500")
    assert balances[bob_id] == Decimal("-500")
    assert sum(balances.values(), Decimal("0")) == Decimal("0")


def test_no_expenses_zero_balance(alice_id, bob_id, list_id):
    """No expenses → all balances zero."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]

    def compute_allocations_fn(*args, **kwargs):
        return MockAllocationResult([])

    def get_split_override_fn(entry_id):
        return None

    def get_list_default_split_fn(list_id):
        return None

    balances = compute_settle_balance_for_list_members(
        [],
        members,
        alice_id,
        compute_allocations_fn,
        get_split_override_fn,
        get_list_default_split_fn,
    )

    assert balances[alice_id] == Decimal("0")
    assert balances[bob_id] == Decimal("0")


def test_expense_with_only_payer_in_allocations(alice_id, bob_id, list_id):
    """Expense where payer paid for self only."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]
    entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    def compute_allocations_fn(
        total,
        currency,
        item_override=None,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=None,
        creator_user_id=None,
        currency_exponent=2,
    ):
        allocations = [
            ShareAllocation(member_id=alice_id, amount=Decimal("1000"), currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    def get_split_override_fn(entry_id):
        return None

    def get_list_default_split_fn(list_id):
        return None

    balances = compute_settle_balance_for_list_members(
        [entry],
        members,
        alice_id,
        compute_allocations_fn,
        get_split_override_fn,
        get_list_default_split_fn,
        default_mode="even",
    )

    assert balances[alice_id] == Decimal("0")
    assert balances[bob_id] == Decimal("0")


def test_invariant_sum_equals_zero(alice_id, bob_id, list_id):
    """Verify invariant: sum of balances = 0."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]
    entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    def compute_allocations_fn(
        total,
        currency,
        item_override=None,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=None,
        creator_user_id=None,
        currency_exponent=2,
    ):
        allocations = [
            ShareAllocation(member_id=alice_id, amount=Decimal("500"), currency="CRC"),
            ShareAllocation(member_id=bob_id, amount=Decimal("500"), currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    def get_split_override_fn(entry_id):
        return None

    def get_list_default_split_fn(list_id):
        return None

    balances = compute_settle_balance_for_list_members(
        [entry],
        members,
        alice_id,
        compute_allocations_fn,
        get_split_override_fn,
        get_list_default_split_fn,
        default_mode="even",
    )

    assert sum(balances.values(), Decimal("0")) == Decimal("0")


def test_percentage_split_with_remainder_to_creator(alice_id, bob_id, charlie_id, list_id):
    """Percentage split with remainder going to list creator."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
        ListMemberView(user_id=charlie_id, alias="Charlie"),
    ]
    entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("1000"),
        currency="CRC",
        payer_id=bob_id,
        line_type="purchase",
    )

    def compute_allocations_fn(
        total,
        currency,
        item_override=None,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=None,
        creator_user_id=None,
        currency_exponent=2,
    ):
        allocations = [
            ShareAllocation(member_id=alice_id, amount=Decimal("333"), currency="CRC"),
            ShareAllocation(member_id=bob_id, amount=Decimal("333"), currency="CRC"),
            ShareAllocation(member_id=charlie_id, amount=Decimal("334"), currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    def get_split_override_fn(entry_id):
        return None

    def get_list_default_split_fn(list_id):
        return None

    balances = compute_settle_balance_for_list_members(
        [entry],
        members,
        charlie_id,
        compute_allocations_fn,
        get_split_override_fn,
        get_list_default_split_fn,
    )

    assert balances[alice_id] == Decimal("-333")
    assert balances[bob_id] == Decimal("667")
    assert balances[charlie_id] == Decimal("-334")
    assert sum(balances.values(), Decimal("0")) == Decimal("0")


def test_double_count_prevention_receipt_level_only(alice_id, bob_id, list_id):
    """Receipt-level allocation only; no double-counting with item-level overrides."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]
    entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    def compute_allocations_fn(
        total,
        currency,
        item_override=None,
        receipt_override=None,
        list_default_mode="even",
        list_default_shares=None,
        member_ids=None,
        creator_user_id=None,
        currency_exponent=2,
    ):
        allocations = [
            ShareAllocation(member_id=alice_id, amount=Decimal("500"), currency="CRC"),
            ShareAllocation(member_id=bob_id, amount=Decimal("500"), currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    def get_split_override_fn(entry_id):
        return None

    def get_list_default_split_fn(list_id):
        return None

    balances = compute_settle_balance_for_list_members(
        [entry],
        members,
        alice_id,
        compute_allocations_fn,
        get_split_override_fn,
        get_list_default_split_fn,
        default_mode="even",
    )

    assert balances[alice_id] == Decimal("500")
    assert balances[bob_id] == Decimal("-500")
    assert sum(balances.values(), Decimal("0")) == Decimal("0")
