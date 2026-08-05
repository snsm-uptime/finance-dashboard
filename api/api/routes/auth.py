"""Auth routes — register, sign-in/out, password-reset, email verification (AD-8 cookies)."""

from __future__ import annotations

import logging
import uuid

from adapters.email import SmtpEmailSender, load_smtp_settings
from adapters.persistence.email_verification import SqlAlchemyEmailVerificationRepository
from adapters.persistence.password_hasher import Argon2PasswordHasher
from adapters.persistence.password_reset import SqlAlchemyPasswordResetTokenRepository
from adapters.persistence.repositories import (
    SqlAlchemyAuthUserRepository,
    SqlAlchemySignupRepository,
)
from adapters.persistence.sessions import (
    SESSION_COOKIE_MAX_AGE,
    create_session,
    resolve_session_user_id,
    revoke_all_sessions_for_user,
    revoke_session,
)
from application.email_verification import (
    ConfirmEmailVerificationCommand,
    ConfirmEmailVerificationService,
    EnsureEmailVerifiedCommand,
    EnsureEmailVerifiedService,
    RequestEmailVerificationCommand,
    RequestEmailVerificationService,
)
from application.password_reset import (
    CompletePasswordResetCommand,
    CompletePasswordResetService,
    RequestPasswordResetCommand,
    RequestPasswordResetService,
)
from application.preferences import (
    GetMePreferencesCommand,
    GetMePreferencesService,
    UpdatePreferencesCommand,
    UpdatePreferencesService,
)
from application.rate_limit import RateLimitPolicy, SlidingWindowRateLimiter
from application.signin import SignInCommand, SignInService
from application.signup import SignupCommand, SignUpService
from domain.errors import (
    DuplicateEmailError,
    EmailNotVerifiedError,
    InvalidCredentialsError,
    InvalidPreferencesError,
    InvalidResetPasswordError,
    InvalidResetTokenError,
    InvalidSignupError,
    InvalidVerificationTokenError,
    PrincipalNotFoundError,
    RateLimitedError,
    SmtpConfigurationError,
    SmtpSendError,
    VerificationNotRequiredError,
)
from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from api.deps import (
    get_auth_settings,
    get_db,
    get_password_hasher,
    get_rate_limiter,
    require_authenticated_user,
    resolve_request_client_ip,
)
from api.schemas.auth import (
    GatedFlowStubResponse,
    MeResponse,
    PasswordResetConfirmBody,
    PasswordResetConfirmResponse,
    PasswordResetRequestBody,
    PasswordResetRequestResponse,
    PatchMeBody,
    RegisterRequest,
    RegisterResponse,
    SessionResponse,
    SignInRequest,
    SignInResponse,
    VerifyConfirmBody,
    VerifyConfirmResponse,
    VerifyRequestResponse,
)
from api.settings import AuthSettings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_GENERIC_CREDENTIALS_CODE = "invalid_credentials"
_RESET_ACK = PasswordResetRequestResponse().detail
_VERIFY_ACK = VerifyRequestResponse().detail
_VERIFY_ALREADY = "Email is already verified."
_VERIFY_NOT_REQUIRED = VerificationNotRequiredError.MESSAGE


def _set_session_cookie(response: Response, settings: AuthSettings, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite=settings.session_cookie_samesite,  # type: ignore[arg-type]
        path="/",
        max_age=SESSION_COOKIE_MAX_AGE,
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


def _rate_limited_response(retry_after: int) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        content={"detail": RateLimitedError.MESSAGE, "code": RateLimitedError.CODE},
        headers={"Retry-After": str(max(1, int(retry_after)))},
    )


def _consume_ip_rate_limit(
    request: Request,
    settings: AuthSettings,
    limiter: SlidingWindowRateLimiter,
    *,
    bucket: str,
    policy: RateLimitPolicy,
) -> JSONResponse | None:
    identity = resolve_request_client_ip(request, settings)
    allowed, retry_after = limiter.check_and_consume(f"{bucket}:{identity}", policy)
    if not allowed:
        return _rate_limited_response(retry_after)
    return None


def _consume_user_rate_limit(
    limiter: SlidingWindowRateLimiter,
    *,
    bucket: str,
    user_id: uuid.UUID,
    policy: RateLimitPolicy,
) -> JSONResponse | None:
    allowed, retry_after = limiter.check_and_consume(f"{bucket}:{user_id}", policy)
    if not allowed:
        return _rate_limited_response(retry_after)
    return None


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


@router.get("/me", response_model=MeResponse)
def current_user(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(require_authenticated_user),
) -> MeResponse | JSONResponse:
    """Current account + stored language/theme (null when unset)."""
    try:
        result = GetMePreferencesService(SqlAlchemyAuthUserRepository(db)).execute(
            GetMePreferencesCommand(user_id=user_id)
        )
    except PrincipalNotFoundError:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Not authenticated.", "code": "unauthenticated"},
        )
    return MeResponse(
        authenticated=True,
        user_id=result.user_id,
        email=result.email,
        language=result.language,
        theme=result.theme,
    )


@router.patch("/me", response_model=MeResponse)
def patch_current_user(
    body: PatchMeBody,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(require_authenticated_user),
) -> MeResponse | JSONResponse:
    """Persist language/theme on the account (source of truth — not device-only)."""
    wrote = body.language is not None or body.theme is not None
    try:
        result = UpdatePreferencesService(SqlAlchemyAuthUserRepository(db)).execute(
            UpdatePreferencesCommand(
                user_id=user_id,
                language=body.language,
                theme=body.theme,
            )
        )
    except InvalidPreferencesError as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc), "code": "invalid_preferences"},
        )
    except PrincipalNotFoundError:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Not authenticated.", "code": "unauthenticated"},
        )
    if wrote:
        logger.info("user_preferences_updated user_id=%s", user_id)
    return MeResponse(
        authenticated=True,
        user_id=result.user_id,
        email=result.email,
        language=result.language,
        theme=result.theme,
    )


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
)
def register(
    body: RegisterRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    hasher: Argon2PasswordHasher = Depends(get_password_hasher),
    settings: AuthSettings = Depends(get_auth_settings),
    limiter: SlidingWindowRateLimiter = Depends(get_rate_limiter),
) -> RegisterResponse | JSONResponse:
    if not settings.session_secret:
        logger.error("SESSION_SECRET is not configured")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Server configuration error.", "code": "config_error"},
        )

    limited = _consume_ip_rate_limit(
        request,
        settings,
        limiter,
        bucket="register",
        policy=settings.rate_limit_register,
    )
    if limited is not None:
        return limited

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

    if settings.email_verification_required:
        try:
            mailer = SmtpEmailSender(load_smtp_settings())
            RequestEmailVerificationService(
                SqlAlchemyAuthUserRepository(db),
                SqlAlchemyEmailVerificationRepository(db),
                mailer,
                public_app_url=settings.public_app_url,
            ).execute(
                RequestEmailVerificationCommand(
                    user_id=result.user_id,
                    email_verification_required=True,
                )
            )
        except (SmtpConfigurationError, SmtpSendError) as exc:
            # Fail loud: do not leave a registered account that was promised a verify email.
            db.rollback()
            logger.error(
                "register_verification_smtp_failed code=%s",
                type(exc).__name__,
            )
            return _smtp_error_response(exc)

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
    limiter: SlidingWindowRateLimiter = Depends(get_rate_limiter),
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

    limited = _consume_ip_rate_limit(
        request,
        settings,
        limiter,
        bucket="sign_in",
        policy=settings.rate_limit_sign_in,
    )
    if limited is not None:
        return limited

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
    request: Request,
    db: Session = Depends(get_db),
    settings: AuthSettings = Depends(get_auth_settings),
    limiter: SlidingWindowRateLimiter = Depends(get_rate_limiter),
) -> PasswordResetRequestResponse | JSONResponse:
    limited = _consume_ip_rate_limit(
        request,
        settings,
        limiter,
        bucket="password_reset_request",
        policy=settings.rate_limit_password_reset_request,
    )
    if limited is not None:
        return limited

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


@router.post("/verify/request", response_model=VerifyRequestResponse)
def request_email_verification(
    db: Session = Depends(get_db),
    settings: AuthSettings = Depends(get_auth_settings),
    user_id: uuid.UUID = Depends(require_authenticated_user),
    limiter: SlidingWindowRateLimiter = Depends(get_rate_limiter),
) -> VerifyRequestResponse | JSONResponse:
    # Gate-off 404 may still consume this user's verify quota (documented; acceptable).
    limited = _consume_user_rate_limit(
        limiter,
        bucket="verify_request",
        user_id=user_id,
        policy=settings.rate_limit_verify_request,
    )
    if limited is not None:
        return limited

    if not settings.email_verification_required:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": _VERIFY_NOT_REQUIRED, "code": "verification_not_required"},
        )

    try:
        mailer = SmtpEmailSender(load_smtp_settings())
        service = RequestEmailVerificationService(
            SqlAlchemyAuthUserRepository(db),
            SqlAlchemyEmailVerificationRepository(db),
            mailer,
            public_app_url=settings.public_app_url,
        )
        result = service.execute(
            RequestEmailVerificationCommand(
                user_id=user_id,
                email_verification_required=settings.email_verification_required,
            )
        )
    except VerificationNotRequiredError:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": _VERIFY_NOT_REQUIRED, "code": "verification_not_required"},
        )
    except PrincipalNotFoundError:
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"detail": "Not authenticated.", "code": "unauthenticated"},
        )
    except (SmtpConfigurationError, SmtpSendError) as exc:
        db.rollback()
        logger.error("email_verification_request_smtp_failed code=%s", type(exc).__name__)
        return _smtp_error_response(exc)

    if result.already_verified:
        return VerifyRequestResponse(detail=_VERIFY_ALREADY, already_verified=True)

    logger.info("email_verification_requested user_id=%s", user_id)
    return VerifyRequestResponse(detail=_VERIFY_ACK, already_verified=False)


@router.post("/verify/confirm", response_model=VerifyConfirmResponse)
def confirm_email_verification(
    body: VerifyConfirmBody,
    db: Session = Depends(get_db),
    settings: AuthSettings = Depends(get_auth_settings),
) -> VerifyConfirmResponse | JSONResponse:
    if not settings.email_verification_required:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": _VERIFY_NOT_REQUIRED, "code": "verification_not_required"},
        )

    service = ConfirmEmailVerificationService(
        SqlAlchemyAuthUserRepository(db),
        SqlAlchemyEmailVerificationRepository(db),
    )
    try:
        result = service.execute(
            ConfirmEmailVerificationCommand(
                token=body.token,
                email_verification_required=settings.email_verification_required,
            )
        )
    except VerificationNotRequiredError:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": _VERIFY_NOT_REQUIRED, "code": "verification_not_required"},
        )
    except InvalidVerificationTokenError as exc:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={"detail": str(exc), "code": "invalid_verification_token"},
        )

    logger.info("email_verification_completed user_id=%s", result.user_id)
    return VerifyConfirmResponse(
        detail="Email verified. You can continue with gated actions.",
        user_id=result.user_id,
    )


@router.post(
    "/gated-flows/invite-accept-stub",
    response_model=GatedFlowStubResponse,
)
def invite_accept_stub(
    db: Session = Depends(get_db),
    settings: AuthSettings = Depends(get_auth_settings),
    user_id: uuid.UUID = Depends(require_authenticated_user),
) -> GatedFlowStubResponse | JSONResponse:
    """Thin gated-flow probe until Epic 2 invite acceptance exists.

    Calls the same EnsureEmailVerifiedService port Epic 2 will use.
    """
    service = EnsureEmailVerifiedService(SqlAlchemyEmailVerificationRepository(db))
    try:
        service.execute(
            EnsureEmailVerifiedCommand(
                user_id=user_id,
                email_verification_required=settings.email_verification_required,
            )
        )
    except EmailNotVerifiedError as exc:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "code": "email_not_verified"},
        )

    return GatedFlowStubResponse(detail="Gated flow allowed.", user_id=user_id)
