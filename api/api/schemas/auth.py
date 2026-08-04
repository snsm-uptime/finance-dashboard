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


class PasswordResetRequestBody(BaseModel):
    email: str = ""


class PasswordResetRequestResponse(BaseModel):
    detail: str = (
        "If that email is registered, you will receive a reset link shortly."
    )


class PasswordResetConfirmBody(BaseModel):
    token: str = ""
    new_password: str = Field(default="", max_length=256)


class PasswordResetConfirmResponse(BaseModel):
    detail: str = "Password updated. You can sign in with your new password."
    user_id: UUID | None = None
