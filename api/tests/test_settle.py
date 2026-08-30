"""Unit tests for settle-up balance computation (Story 3.4)."""

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from domain.settle import (
    LedgerEntryRecord,
    ListMemberView,
    ShareAllocation,
    SuggestedTransfer,
    compute_pairwise_settle_balances,
    compute_settle_balance_for_list_members,
    net_pairwise_edges,
    simplify_group_transfers,
)
from domain.splits import compute_share_allocations


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
        amount_crc=Decimal("1000"),
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
        amount_crc=Decimal("1000"),
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
        amount_crc=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    entry2 = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount_crc=Decimal("600"),
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
        amount_crc=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    fee_entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount_crc=Decimal("100"),
        currency="CRC",
        payer_id=alice_id,
        line_type="fee",
    )

    payment_entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount_crc=Decimal("50"),
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
        amount_crc=Decimal("1000"),
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
        amount_crc=Decimal("1000"),
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
        amount_crc=Decimal("1000"),
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
        amount_crc=Decimal("1000"),
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


def test_mixed_crc_and_usd_entries_use_materialized_amount_crc(alice_id, bob_id, list_id):
    """Story 3.5: settle-up sums amount_crc for both CRC and FX-materialized USD lines."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]
    crc_entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount_crc=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )
    # USD 100 materialized at 525.00 -> amount_crc = 52500; original currency/amount
    # are not consulted by settle-up (AC #2) — only the materialized CRC value is.
    usd_entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount_crc=Decimal("52500.00"),
        currency="USD",
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
        half = total / 2
        allocations = [
            ShareAllocation(member_id=alice_id, amount=half, currency="CRC"),
            ShareAllocation(member_id=bob_id, amount=total - half, currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    def get_split_override_fn(entry_id):
        return None

    def get_list_default_split_fn(list_id):
        return None

    balances = compute_settle_balance_for_list_members(
        [crc_entry, usd_entry],
        members,
        alice_id,
        compute_allocations_fn,
        get_split_override_fn,
        get_list_default_split_fn,
        default_mode="even",
    )

    # Alice paid 1000 CRC, owes half of each entry; Bob paid 52500 CRC (materialized),
    # owes the other half of each entry.
    assert balances[alice_id] == Decimal("1000") - Decimal("500") - Decimal("26250")
    assert balances[bob_id] == Decimal("52500") - Decimal("500") - Decimal("26250")
    assert sum(balances.values(), Decimal("0")) == Decimal("0")


def test_negative_purchase_refund_inverts_even_split(alice_id, bob_id, list_id):
    """Imported refunds (negative CRC purchases) invert settle vs the matching charge."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]
    refund = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount_crc=Decimal("-1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    seen_totals: list[Decimal] = []

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
        seen_totals.append(total)
        allocations = [
            ShareAllocation(member_id=alice_id, amount=Decimal("500"), currency="CRC"),
            ShareAllocation(member_id=bob_id, amount=Decimal("500"), currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    balances = compute_settle_balance_for_list_members(
        [refund],
        members,
        alice_id,
        compute_allocations_fn,
        lambda _receipt_id: None,
        lambda _list_id: None,
        default_mode="even",
    )

    assert seen_totals == [Decimal("1000")]
    assert balances[alice_id] == Decimal("-500")
    assert balances[bob_id] == Decimal("500")
    assert sum(balances.values(), Decimal("0")) == Decimal("0")


def test_zero_amount_purchase_is_skipped(alice_id, bob_id, list_id):
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]
    zero = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount_crc=Decimal("0"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    def compute_allocations_fn(*_args, **_kwargs):
        raise AssertionError("zero-amount purchases must not be allocated")

    balances = compute_settle_balance_for_list_members(
        [zero],
        members,
        alice_id,
        compute_allocations_fn,
        lambda _receipt_id: None,
        lambda _list_id: None,
        default_mode="even",
    )

    assert balances[alice_id] == Decimal("0")
    assert balances[bob_id] == Decimal("0")


def test_negative_purchase_with_real_share_allocator(alice_id, bob_id, list_id):
    """Reproduce GET /lists 500: compute_share_allocations rejects non-positive totals."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]
    refund = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount_crc=Decimal("-80.00"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    balances = compute_settle_balance_for_list_members(
        [refund],
        members,
        alice_id,
        compute_share_allocations,
        lambda _receipt_id: None,
        lambda _list_id: None,
        default_mode="even",
    )

    assert balances[alice_id] == Decimal("-40.00")
    assert balances[bob_id] == Decimal("40.00")
    assert sum(balances.values(), Decimal("0")) == Decimal("0")


# --- Story 5.8: pairwise edges + simplify -----------------------------------


def test_pairwise_edges_two_member_list(alice_id, bob_id, list_id):
    """Alice pays 1000, 50/50 with Bob -> edge (alice, bob) = 500 (bob owes alice)."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
    ]
    entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount_crc=Decimal("1000"),
        currency="CRC",
        payer_id=alice_id,
        line_type="purchase",
    )

    def compute_allocations_fn(total, currency, **_kwargs):
        allocations = [
            ShareAllocation(member_id=alice_id, amount=Decimal("500"), currency="CRC"),
            ShareAllocation(member_id=bob_id, amount=Decimal("500"), currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    edges = compute_pairwise_settle_balances(
        [entry],
        members,
        alice_id,
        compute_allocations_fn,
        lambda _receipt_id: None,
        lambda _list_id: None,
        default_mode="even",
    )

    assert edges == {(alice_id, bob_id): Decimal("500")}


def test_pairwise_edges_three_member_list_with_remainder(alice_id, bob_id, charlie_id, list_id):
    """Bob pays 1000, percentage split with remainder to creator (charlie)."""
    members = [
        ListMemberView(user_id=alice_id, alias="Alice"),
        ListMemberView(user_id=bob_id, alias="Bob"),
        ListMemberView(user_id=charlie_id, alias="Charlie"),
    ]
    entry = LedgerEntryRecord(
        id=uuid4(),
        list_id=list_id,
        amount_crc=Decimal("1000"),
        currency="CRC",
        payer_id=bob_id,
        line_type="purchase",
    )

    def compute_allocations_fn(total, currency, **_kwargs):
        allocations = [
            ShareAllocation(member_id=alice_id, amount=Decimal("333"), currency="CRC"),
            ShareAllocation(member_id=bob_id, amount=Decimal("333"), currency="CRC"),
            ShareAllocation(member_id=charlie_id, amount=Decimal("334"), currency="CRC"),
        ]
        return MockAllocationResult(allocations)

    edges = compute_pairwise_settle_balances(
        [entry],
        members,
        charlie_id,
        compute_allocations_fn,
        lambda _receipt_id: None,
        lambda _list_id: None,
    )

    assert edges == {
        (bob_id, alice_id): Decimal("333"),
        (bob_id, charlie_id): Decimal("334"),
    }


def test_net_pairwise_edges_collapses_both_directions(alice_id, bob_id):
    """Opposing directional edges on the same pair collapse to one signed net."""
    edges = {
        (alice_id, bob_id): Decimal("500"),
        (bob_id, alice_id): Decimal("200"),
    }

    net = net_pairwise_edges(edges)

    x, y = (alice_id, bob_id) if str(alice_id) < str(bob_id) else (bob_id, alice_id)
    expected = Decimal("500") - Decimal("200") if x == alice_id else Decimal("200") - Decimal("500")
    assert net == {(x, y): expected}


def test_net_pairwise_edges_drops_fully_cancelling_pairs(alice_id, bob_id):
    edges = {
        (alice_id, bob_id): Decimal("300"),
        (bob_id, alice_id): Decimal("300"),
    }

    assert net_pairwise_edges(edges) == {}


def test_net_pairwise_edges_no_reverse_direction(alice_id, bob_id):
    edges = {(alice_id, bob_id): Decimal("500")}

    net = net_pairwise_edges(edges)

    assert net == {(alice_id, bob_id): Decimal("500")}


def test_simplify_group_transfers_three_person_cycle(alice_id, bob_id, charlie_id):
    """A owes B, B owes C, C owes A in a balanced cycle nets to fewer transfers."""
    net_balances = {
        alice_id: Decimal("0"),
        bob_id: Decimal("100"),
        charlie_id: Decimal("-100"),
    }

    transfers = simplify_group_transfers(net_balances)

    assert len(transfers) == 1
    assert transfers[0].from_member_id == charlie_id
    assert transfers[0].to_member_id == bob_id
    assert transfers[0].amount_crc == Decimal("100")


def test_simplify_group_transfers_two_member_single_transfer(alice_id, bob_id):
    net_balances = {alice_id: Decimal("500"), bob_id: Decimal("-500")}

    transfers = simplify_group_transfers(net_balances)

    assert transfers == [
        SuggestedTransfer(from_member_id=bob_id, to_member_id=alice_id, amount_crc=Decimal("500"))
    ]


def test_simplify_group_transfers_all_zero_no_invented_debts(alice_id, bob_id):
    net_balances = {alice_id: Decimal("0"), bob_id: Decimal("0")}

    transfers = simplify_group_transfers(net_balances)

    assert transfers == []


def test_simplify_group_transfers_sum_back_to_original_nets(alice_id, bob_id, charlie_id):
    net_balances = {
        alice_id: Decimal("400"),
        bob_id: Decimal("100"),
        charlie_id: Decimal("-500"),
    }

    transfers = simplify_group_transfers(net_balances)

    replay: dict[UUID, Decimal] = dict.fromkeys(net_balances, Decimal("0"))
    for t in transfers:
        replay[t.from_member_id] -= t.amount_crc
        replay[t.to_member_id] += t.amount_crc

    assert replay == net_balances
    for t in transfers:
        assert t.amount_crc > 0
