"""Application factory."""

from __future__ import annotations

import logging

from fastapi import FastAPI

from api.routes.health import router as health_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


def create_app() -> FastAPI:
    application = FastAPI(title="finance-helper-api", version="0.1.0")
    application.include_router(health_router)
    return application
