"""Application factory."""

from __future__ import annotations

import logging

from application.rate_limit import SlidingWindowRateLimiter
from fastapi import FastAPI

from api.routes.auth import router as auth_router
from api.routes.health import router as health_router
from api.routes.invites import router as invites_router
from api.routes.lists import router as lists_router
from api.settings import load_auth_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


def create_app() -> FastAPI:
    application = FastAPI(title="finance-helper-api", version="0.1.0")
    application.state.auth_settings = load_auth_settings()
    application.state.rate_limiter = SlidingWindowRateLimiter()
    application.include_router(health_router)
    application.include_router(auth_router)
    application.include_router(lists_router)
    application.include_router(invites_router)
    return application
