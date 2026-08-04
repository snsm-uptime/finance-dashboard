"""Pydantic DTOs for list create / rename (snake_case wire)."""

from __future__ import annotations

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


class ListMembershipsResponse(BaseModel):
    lists: list[ListMembershipItem]
