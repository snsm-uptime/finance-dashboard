"""Auth routes — register, sign-in/out, password-reset (AD-8 cookies)."""

from __future__ import annotations

import logging
import uuid

from adapters.email import SmtpEmailSender, load_smtp_settings
from adapters.persistence.password_hasher import Argon2PasswordHasher
from adapters.persistence.password_reset import SqlAlchemyPasswordResetTokenRepository
from adapters.persistence.repositories import (
    SqlAlchemyAuthUserRepository,
    SqlAlchemySignupRepository,
)
from adapters.persistence.sessions import (
    create_session,
    resolve_session_user_id,
    revoke_all_sessions_for_user,
    revoke_session,
)
from application.password_reset import (
    CompletePasswordResetCommand,
    CompletePasswordResetService,
    RequestPasswordResetCommand,
    RequestPasswordResetService,
)
from application.signin import SignInCommand, SignInService
from application.signup import SignupCommand, SignUpService
from domain.errors import (
    DuplicateEmailError,
    InvalidCredentialsError,
    InvalidResetPasswordError,
    InvalidResetTokenError,
    InvalidSignupError,
    SmtpConfigurationError,
    SmtpSendError,
)
from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import get_auth_settings, get_db, get_password_hasher, require_authenticated_user
from api.schemas.auth import (
    PasswordResetConfirmBody,
    PasswordResetConfirmResponse,
    PasswordResetRequestBody,
    PasswordResetRequestResponse,
    RegisterRequest,
    RegisterResponse,
    SessionResponse,
    SignInRequest,
    SignInResponse,
)
from api.settings import AuthSettings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_SESSION_MAX_AGE = 60 * 60 * 24 * 30
_GENERIC_CREDENTIALS_CODE = "invalid_credentials"
_RESET_ACK = PasswordResetRequestResponse().detail


def _set_session_cookie(response: Response, settings: AuthSettings, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,  # type: ignore[arg-type]
        path="/",
        max_age=_SESSION_MAX_AGE,
    )


def _clear_session_cookie(response: Response, settings: AuthSettings) -> None:
    # Explicit expiry so browsers drop the cookie even when attributes differ slightly.
    response.set_cookie(
        key=settings.session_cookie_name,
        value="",
        max_age=0,
        expires=0,
        path="/",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,  # type: ignore[arg-type]
    )


def _credentials_error_response() -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_401_UNAUTHORIZED,
        content={
            "detail": InvalidCredentialsError.MESSAGE,
            "code": _GENERIC_CREDENTIALS_CODE,
        },
    )


def _smtp_error_response(exc: SmtpConfigurationError | SmtpSendError) -> JSONResponse:
    code = "smtp_config_error" if isinstance(exc, SmtpConfigurationError) else "smtp_send_error"
    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"detail": str(exc), "code": code},
    )


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


@router.get("/me", response_model=SessionResponse)
def current_user(user_id: uuid.UUID = Depends(require_authenticated_user)) -> SessionResponse:
    """Protected current-user probe (auth gate for list/upload APIs to reuse)."""
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

    revoke_all_sessions_for_user(db, result.user_id)
    token = create_session(db, user_id=result.user_id)
    _set_session_cookie(response, settings, token)
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


@router.post("/sign-in", response_model=SignInResponse)
async def sign_in(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    hasher: Argon2PasswordHasher = Depends(get_password_hasher),
    settings: AuthSettings = Depends(get_auth_settings),
) -> SignInResponse | JSONResponse:
    if not settings.session_secret:
        logger.error("SESSION_SECRET is not configured")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Server configuration error.", "code": "config_error"},
        )

    try:
        payload = await request.json()
    except Exception:
        return _credentials_error_response()
    if not isinstance(payload, dict):
        return _credentials_error_response()
    email = payload.get("email") if isinstance(payload.get("email"), str) else ""
    password = payload.get("password") if isinstance(payload.get("password"), str) else ""
    body = SignInRequest(email=email, password=password)

    service = SignInService(SqlAlchemyAuthUserRepository(db), hasher)
    try:
        result = service.execute(SignInCommand(email=body.email, password=body.password))
    except InvalidCredentialsError:
        return _credentials_error_response()

    revoke_all_sessions_for_user(db, result.user_id)
    token = create_session(db, user_id=result.user_id)
    _set_session_cookie(response, settings, token)
    logger.info("user_signed_in user_id=%s", result.user_id)
    return SignInResponse(user_id=result.user_id, email=result.email)


@router.post("/sign-out", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: AuthSettings = Depends(get_auth_settings),
) -> Response:
    token = request.cookies.get(settings.session_cookie_name)
    revoke_session(db, token)
    _clear_session_cookie(response, settings)
    logger.info("user_signed_out")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/password-reset/request",
    response_model=PasswordResetRequestResponse,
)
def request_password_reset(
    body: PasswordResetRequestBody,
    db: Session = Depends(get_db),
    settings: AuthSettings = Depends(get_auth_settings),
) -> PasswordResetRequestResponse | JSONResponse:
    try:
        mailer = SmtpEmailSender(load_smtp_settings())
        service = RequestPasswordResetService(
            SqlAlchemyAuthUserRepository(db),
            SqlAlchemyPasswordResetTokenRepository(db),
            mailer,
            public_app_url=settings.public_app_url,
        )
        service.execute(RequestPasswordResetCommand(email=body.email))
    except (SmtpConfigurationError, SmtpSendError) as exc:
        # Persist-before-send: roll back staged token so SMTP failure is never "sent".
        db.rollback()
        logger.error("password_reset_request_smtp_failed code=%s", type(exc).__name__)
        return _smtp_error_response(exc)

    logger.info("password_reset_requested")
    return PasswordResetRequestResponse(detail=_RESET_ACK)


@router.post(
    "/password-reset/confirm",
    response_model=PasswordResetConfirmResponse,
)
def confirm_password_reset(
    body: PasswordResetConfirmBody,
    db: Session = Depends(get_db),
    hasher: Argon2PasswordHasher = Depends(get_password_hasher),
) -> PasswordResetConfirmResponse | JSONResponse:
    service = CompletePasswordResetService(
        SqlAlchemyAuthUserRepository(db),
        SqlAlchemyPasswordResetTokenRepository(db),
        hasher,
    )
    try:
        result = service.execute(
            CompletePasswordResetCommand(token=body.token, new_password=body.new_password)
        )
    except InvalidResetTokenError as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc), "code": "invalid_reset_token"},
        )
    except InvalidResetPasswordError as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc), "code": "invalid_reset_password"},
        )

    logger.info("password_reset_completed user_id=%s", result.user_id)
    return PasswordResetConfirmResponse(
        detail="Password updated. You can sign in with your new password.",
        user_id=result.user_id,
    )
