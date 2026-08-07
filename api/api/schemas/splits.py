"""Pydantic DTOs for item/receipt split overrides + share allocations (Story 2.6)."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class SetSplitOverrideBody(BaseModel):
    kind: Literal["whole_assignee", "absolute_amounts", "percentage"]
    assignee_id: UUID | None = None
    amounts: dict[UUID, str] | None = None
    percentages: dict[UUID, str] | None = None

    @model_validator(mode="after")
    def validate_kind_payload(self) -> SetSplitOverrideBody:
        if self.kind == "whole_assignee" and self.assignee_id is None:
            raise ValueError("whole_assignee requires assignee_id")
        if self.kind == "absolute_amounts" and not self.amounts:
            raise ValueError("absolute_amounts requires amounts")
        if self.kind == "percentage" and not self.percentages:
            raise ValueError("percentage requires percentages")
        return self


class SplitOverrideResponse(BaseModel):
    list_id: UUID
    subject_kind: Literal["item", "receipt"]
    subject_id: UUID
    kind: Literal["whole_assignee", "absolute_amounts", "percentage"]
    assignee_id: UUID | None = None
    amounts: dict[UUID, str] | None = None
    percentages: dict[UUID, str] | None = None
    set_by_user_id: UUID


class ShareAllocationItem(BaseModel):
    member_id: UUID
    amount: str
    currency: str


class ShareAllocationsResponse(BaseModel):
    allocations: list[ShareAllocationItem] = Field(default_factory=list)
    resolved_from: Literal["item", "receipt", "list_default"]
