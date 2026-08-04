"""Auth request/response DTOs (snake_case wire)."""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=256)


class RegisterResponse(BaseModel):
    user_id: UUID
    email: str
    list_id: UUID
    list_name: str


class SignInRequest(BaseModel):
    email: str = ""
    password: str = ""


class SignInResponse(BaseModel):
    user_id: UUID
    email: str


class SessionResponse(BaseModel):
    authenticated: bool
    user_id: UUID
