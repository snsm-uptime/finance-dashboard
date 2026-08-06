"""Pydantic DTOs for list create / rename / membership / detail / default split."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from domain.lists import LIST_NAME_MAX_LENGTH
from pydantic import BaseModel, Field


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


class ListMembershipItem(BaseModel):
    id: UUID
    name: str
    owner_id: UUID
    role: str
    balance_crc: str = "0"


class ListMembershipsResponse(BaseModel):
    lists: list[ListMembershipItem]


class ListDetailResponse(BaseModel):
    id: UUID
    name: str
    owner_id: UUID


class ListExpensesStubResponse(BaseModel):
    list_id: UUID
    expenses: list[object] = Field(default_factory=list)


class ListBalancesStubResponse(BaseModel):
    list_id: UUID
    balance_crc: str


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
