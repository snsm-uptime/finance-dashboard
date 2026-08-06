"""Invite preview / accept DTOs (snake_case wire). Story 2.4."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class InvitePreviewResponse(BaseModel):
    list_name: str
    email_hint: str
    path: Literal["signup", "join"]


class AcceptInviteRequest(BaseModel):
    token: str = Field(default="", max_length=512)


class AcceptInviteResponse(BaseModel):
    list_id: UUID
