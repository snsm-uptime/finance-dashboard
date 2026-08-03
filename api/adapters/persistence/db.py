"""SQLAlchemy engine helpers (no domain tables in Story 1.1)."""

from __future__ import annotations

import os
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

_DEFAULT_URL = "postgresql+psycopg://finance:finance_dev_change_me@localhost:5432/finance_helper"


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL") or ""
    return url.strip() or _DEFAULT_URL


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(_database_url(), pool_pre_ping=True)


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, autocommit=False)
