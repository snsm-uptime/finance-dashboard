"""Application factory."""

from __future__ import annotations

import logging

from application.rate_limit import SlidingWindowRateLimiter
from domain.errors import AliasRequiredError, InvalidPhotoError
from fastapi import Depends, FastAPI, Request, status
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from api.deps import require_user_alias
from api.routes.auth import router as auth_router
from api.routes.budgets import router as budgets_router
from api.routes.cards import router as cards_router
from api.routes.health import router as health_router
from api.routes.import_conflicts import router as import_conflicts_router
from api.routes.import_sessions import router as import_sessions_router
from api.routes.invites import router as invites_router
from api.routes.lists import router as lists_router
from api.routes.splits import router as splits_router
from api.settings import load_auth_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


def create_app() -> FastAPI:
    application = FastAPI(title="finance-helper-api", version="0.1.0")
    application.state.auth_settings = load_auth_settings()
    application.state.rate_limiter = SlidingWindowRateLimiter()

    @application.exception_handler(AliasRequiredError)
    async def _alias_required_handler(_: Request, exc: AliasRequiredError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={"detail": str(exc), "code": AliasRequiredError.CODE},
        )

    @application.exception_handler(RequestValidationError)
    async def _validation_error_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # PatchMeBody.photo_base64 has a wire-level max_length guard so a
        # grossly oversized payload fails fast, before domain.validate_photo()
        # would decode it — but callers still expect the same invalid_photo
        # contract regardless of which layer rejected it.
        for error in exc.errors():
            if error.get("loc", ())[-1:] == ("photo_base64",):
                return JSONResponse(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    content={"detail": InvalidPhotoError.MESSAGE, "code": InvalidPhotoError.CODE},
                )
        return await request_validation_exception_handler(request, exc)

    application.include_router(health_router)
    application.include_router(auth_router)
    # List chrome needs a person label; invites/auth stay open so the alias can be claimed.
    application.include_router(lists_router, dependencies=[Depends(require_user_alias)])
    application.include_router(splits_router, dependencies=[Depends(require_user_alias)])
    application.include_router(budgets_router, dependencies=[Depends(require_user_alias)])
    application.include_router(invites_router)
    # Cards are a personal resource, not a list-roster surface — no alias gate.
    application.include_router(cards_router)
    # Upload is a global entry point (EXPERIENCE.md), not list-scoped — list/alias
    # assignment happens in review (Stories 4.7/4.8), not here.
    application.include_router(import_sessions_router)
    # Conflict pairs span two lists — global route, same rationale as upload.
    application.include_router(import_conflicts_router)
    return application
