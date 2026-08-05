"""Shared Postgres integration fixtures.

Integration suites skip when DATABASE_URL is unset so host unit runs stay fast.
Mailer-aware client fixtures stay in password-reset / email-verification modules
(or use make_client with mailer monkeypatches) — do not flatten those into one naive client.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker
from tests.integration_db import database_url, make_client


@pytest.fixture(scope="module")
def engine() -> Iterator[Engine]:
    url = database_url()
    if url is None:
        pytest.skip("DATABASE_URL not set — Postgres 16 required for integration tests")
    eng = create_engine(url, pool_pre_ping=True)
    from alembic import command
    from alembic.config import Config

    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", url)
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    connection = engine.connect()
    transaction = connection.begin()
    session = sessionmaker(bind=connection, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    yield from make_client(db_session, monkeypatch, smtp=False)
