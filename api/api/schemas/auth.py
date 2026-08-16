"""Auth request/response DTOs (snake_case wire)."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=256)
    invite_token: str | None = Field(default=None, max_length=512)


class RegisterResponse(BaseModel):
    user_id: UUID
    email: str
    list_id: UUID
    list_name: str
    inviting_list_id: UUID | None = None


class SignInRequest(BaseModel):
    email: str = ""
    password: str = ""


class SignInResponse(BaseModel):
    user_id: UUID
    email: str


class SessionResponse(BaseModel):
    authenticated: bool
    user_id: UUID


class MeResponse(BaseModel):
    authenticated: bool = True
    user_id: UUID
    email: str
    alias: str | None = None
    language: str | None = None
    theme: str | None = None
    last_opened_list_id: UUID | None = None
    default_import_list_id: UUID | None = None


class PatchMeBody(BaseModel):
    language: Literal["en", "es"] | None = None
    theme: Literal["light", "dark", "system"] | None = None
    last_opened_list_id: UUID | None = None
    default_import_list_id: UUID | None = None
    # Wide wire bound so length/charset failures answer with `invalid_alias`
    # from the domain instead of an unlabelled pydantic 422.
    alias: str | None = Field(default=None, max_length=255)


class PasswordResetRequestBody(BaseModel):
    email: str = ""


class PasswordResetRequestResponse(BaseModel):
    detail: str = "If that email is registered, you will receive a reset link shortly."


class PasswordResetConfirmBody(BaseModel):
    token: str = ""
    new_password: str = Field(default="", max_length=256)


class PasswordResetConfirmResponse(BaseModel):
    detail: str = "Password updated. You can sign in with your new password."
    user_id: UUID | None = None


class VerifyRequestResponse(BaseModel):
    detail: str = "Check your inbox for a verification link."
    already_verified: bool = False


class VerifyConfirmBody(BaseModel):
    token: str = ""


class VerifyConfirmResponse(BaseModel):
    detail: str = "Email verified. You can continue with gated actions."
    user_id: UUID | None = None


class GatedFlowStubResponse(BaseModel):
    detail: str = "Gated flow allowed."
    user_id: UUID
