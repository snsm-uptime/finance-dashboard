"""Container entrypoint: run Alembic then serve the API."""

from __future__ import annotations

import logging
import os
import subprocess
import sys

import uvicorn

logger = logging.getLogger(__name__)


def _env_truthy(name: str) -> bool:
    return (os.environ.get(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def main() -> None:
    log_level_str = os.environ.get("LOG_LEVEL", "INFO").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    logger.info("Running Alembic migrations")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            check=False,
            timeout=120,
        )
    except subprocess.TimeoutExpired:
        logger.error("Alembic timed out after 120s")
        raise SystemExit(1) from None

    if result.returncode != 0:
        logger.error("Alembic failed with code %s", result.returncode)
        raise SystemExit(result.returncode)

    reload = _env_truthy("DEV_RELOAD")
    # Local/dev: do not trust arbitrary X-Forwarded-* until a reverse proxy is in front.
    uvicorn.run(
        "api:app",
        host="0.0.0.0",
        port=8000,
        proxy_headers=False,
        reload=reload,
    )


if __name__ == "__main__":
    main()
