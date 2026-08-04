"""Pydantic DTOs for list create / rename (snake_case wire)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class CreateListBody(BaseModel):
    name: str = Field(min_length=1)


class RenameListBody(BaseModel):
    name: str = Field(min_length=1)


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
