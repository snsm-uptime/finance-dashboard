"""Auth routes — register with httpOnly Secure session cookie (AD-8)."""

from __future__ import annotations

import logging

from adapters.persistence.password_hasher import Argon2PasswordHasher
from adapters.persistence.repositories import SqlAlchemySignupRepository
from adapters.persistence.sessions import create_session, resolve_session_user_id
from application.signup import SignupCommand, SignUpService
from domain.errors import DuplicateEmailError, InvalidSignupError
from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_auth_settings, get_db, get_password_hasher
from api.schemas.auth import RegisterRequest, RegisterResponse, SessionResponse
from api.settings import AuthSettings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/session", response_model=SessionResponse)
def session_status(
    request: Request,
    db: Session = Depends(get_db),
    settings: AuthSettings = Depends(get_auth_settings),
) -> SessionResponse | JSONResponse:
    token = request.cookies.get(settings.session_cookie_name)
    user_id = resolve_session_user_id(db, token)
    if user_id is None:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Not authenticated.", "code": "unauthenticated"},
        )
    return SessionResponse(authenticated=True, user_id=user_id)


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    body: RegisterRequest,
    response: Response,
    db: Session = Depends(get_db),
    hasher: Argon2PasswordHasher = Depends(get_password_hasher),
    settings: AuthSettings = Depends(get_auth_settings),
) -> RegisterResponse | JSONResponse:
    if not settings.session_secret:
        logger.error("SESSION_SECRET is not configured")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Server configuration error.", "code": "config_error"},
        )

    service = SignUpService(SqlAlchemySignupRepository(db), hasher)
    try:
        result = service.execute(
            SignupCommand(
                email=body.email,
                password=body.password,
                email_verification_required=settings.email_verification_required,
            )
        )
    except InvalidSignupError as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc), "code": "invalid_signup"},
        )
    except DuplicateEmailError:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": "An account with this email already exists.",
                "code": "duplicate_email",
            },
        )

    token = create_session(db, user_id=result.user_id)
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,  # type: ignore[arg-type]
        path="/",
        max_age=60 * 60 * 24 * 30,
    )
    logger.info(
        "user_registered user_id=%s list_id=%s",
        result.user_id,
        result.list_id,
    )
    return RegisterResponse(
        user_id=result.user_id,
        email=result.email,
        list_id=result.list_id,
        list_name=result.list_name,
    )
