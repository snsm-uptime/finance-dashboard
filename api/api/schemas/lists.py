"""Pydantic DTOs for list create / rename / membership / detail / default split / expenses."""

from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from domain.lists import LIST_NAME_MAX_LENGTH
from pydantic import BaseModel, Field

from api.schemas.splits import SetSplitOverrideBody


class CreateListBody(BaseModel):
    # Domain validates blank/whitespace via InvalidListNameError for a stable
    # `invalid_list_name` code; wire only caps length to match DB String(200).
    name: str = Field(max_length=LIST_NAME_MAX_LENGTH)


class RenameListBody(BaseModel):
    name: str = Field(max_length=LIST_NAME_MAX_LENGTH)


class ListResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID


class ListMemberItem(BaseModel):
    """Roster label is the alias — email never leaves the invite/auth surfaces."""

    user_id: UUID
    alias: str | None = None


class ListMembershipItem(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    role: str
    balance_crc: str = "0"
    members: list[ListMemberItem] = Field(default_factory=list)


class ListMembershipsResponse(BaseModel):
    lists: list[ListMembershipItem]


class ListDetailResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID


class PeriodResponse(BaseModel):
    start: str
    end: str


class ExpenseItemResponse(BaseModel):
    id: UUID
    list_id: UUID
    amount: str
    currency: str
    description: str
    payer_id: UUID
    provenance: Literal["hand", "parser"]
    line_type: str
    posted_date: str
    created_at: datetime
    # FX materialized at commit (Story 3.5 / AC #3 audit trail) — CRC rows are 1:1.
    amount_crc: str
    fx_rate: str
    fx_rate_date: str | None = None
    fx_fallback: bool = False
    # Origin (card / Cash / blank) — Story 4.2 / FR-21.
    origin_kind: Literal["card", "cash"] | None = None
    origin_card_id: UUID | None = None
    import_batch_id: UUID | None = None
    # Viewer lens for the receipt row (stated share + CRC net). Null when omitted.
    viewer_share_kind: Literal["percentage", "absolute"] | None = None
    viewer_share_value: str | None = None
    viewer_net_crc: str | None = None
    viewer_net_polarity: Literal["owe", "owed", "zero"] | None = None
    origin_card_label: str | None = None
    import_batch_id: UUID | None = None
    statement_id: UUID | None = None


class ListExpensesStubResponse(BaseModel):
    list_id: UUID
    expenses: list[ExpenseItemResponse] = Field(default_factory=list)


class CreateExpenseBody(BaseModel):
    amount: str
    currency: str = "CRC"
    description: str
    payer_id: UUID
    split_override: SetSplitOverrideBody | None = None
    origin_kind: Literal["card", "cash"] | None = None
    origin_card_id: UUID | None = None


class CreateExpenseResponse(BaseModel):
    id: UUID
    list_id: UUID
    amount: str
    currency: str
    description: str
    payer_id: UUID
    provenance: Literal["hand"]
    line_type: str
    posted_date: str
    created_at: datetime
    amount_crc: str
    fx_rate: str
    fx_rate_date: str | None = None
    fx_fallback: bool = False
    origin_kind: Literal["card", "cash"] | None = None
    origin_card_id: UUID | None = None


class UpdateExpenseOriginBody(BaseModel):
    origin_kind: Literal["card", "cash"] | None = None
    origin_card_id: UUID | None = None


class ListMembersResponse(BaseModel):
    members: list[ListMemberItem]


class BalanceStatusResponse(BaseModel):
    is_incomplete: bool


class PairwiseEdgeResponse(BaseModel):
    member_id: UUID
    alias: str | None = None
    amount_crc: str


class ListBalancesStubResponse(BaseModel):
    list_id: UUID
    balance_crc: str
    balance_status: BalanceStatusResponse
    you_are_owed: list[PairwiseEdgeResponse] = Field(default_factory=list)
    you_owe: list[PairwiseEdgeResponse] = Field(default_factory=list)


class CycleItemResponse(BaseModel):
    statement_id: UUID
    card_id: UUID | None = None
    card_label: str | None = None
    period_start: str
    period_end: str


class ListCyclesResponse(BaseModel):
    cycles: list[CycleItemResponse] = Field(default_factory=list)
    default_statement_id: UUID | None = None
    fallback_period: PeriodResponse | None = None


class TransferResponse(BaseModel):
    from_member_id: UUID
    from_alias: str | None = None
    to_member_id: UUID
    to_alias: str | None = None
    amount_crc: str


class SimplifyPlanResponse(BaseModel):
    transfers: list[TransferResponse]
    is_incomplete: bool


class DefaultSplitShareItem(BaseModel):
    user_id: UUID
    percentage: str


class DefaultSplitResponse(BaseModel):
    list_id: UUID
    owner_id: UUID
    mode: Literal["even", "percentage"]
    shares: list[DefaultSplitShareItem]
    member_ids: list[UUID]


class SetDefaultSplitBody(BaseModel):
    mode: Literal["even", "percentage"]
    shares: list[DefaultSplitShareItem] | None = None


class InviteMemberBody(BaseModel):
    email: str = Field(max_length=320)


class InviteMemberResponse(BaseModel):
    status: str
    template_kind: str
    invite_id: UUID


class ReassignStatementBody(BaseModel):
    destination_list_id: UUID


class ReassignStatementResponse(BaseModel):
    ledger_entry_ids: list[UUID]
    batch_ids: list[UUID]
    from_list_ids: list[UUID]
    destination_list_id: UUID
