"""Postgres integration tests for Import Session upload/discard (Story 4.6).

Requires DATABASE_URL (Compose db or CI Postgres 16). Skips when unset.
Uses the real ADAPTERS registry (Story 4.4/4.5) via get_bank_adapters — the
unknown_bank_adapter and 201 happy-path cases are genuine outcomes now, not
placeholders.
"""

from __future__ import annotations

import importlib.util
import os
import shutil
import time
from collections.abc import Iterator
from datetime import date
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from adapters.persistence.import_sessions import SqlAlchemyImportSessionRepository
from adapters.persistence.models import LedgerEntryModel
from domain.errors import ImportSessionAlreadyCommittedError
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from tests.integration_db import claim_alias, database_url, make_client

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)


class _FakeUsdBccrClient:
    """Deterministic BCCR double (mirrors test_manual_expense_api.py) — the
    BAC acceptance-bar fixture carries one USD row, so Bulk-commit tests need
    a real FX rate rather than the deferred UnavailableBccrClient (AD-7,
    project-context "never live BCCR in CI")."""

    def get_rate(self, rate_date: date, currency: str) -> Decimal | None:
        if currency == "USD":
            return Decimal("525.00")
        return None

    def get_nearest_prior_rate(self, rate_date: date, currency: str):
        return None

    def supported_currencies(self) -> list[str]:
        return ["USD"]


@pytest.fixture
def client_with_fx(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    yield from make_client(db_session, monkeypatch, smtp=False, bccr_client=_FakeUsdBccrClient())


_FIXTURE_DIR = Path(__file__).parent / "fixtures" / "pdf"
_ACCEPTANCE_BAR_PDF = _FIXTURE_DIR / "bac_credit_acceptance_bar.pdf"
_GOLDENS_PATH = _FIXTURE_DIR / "bac_credit_acceptance_bar_goldens.py"
_SYNTHETIC_MULTI_STATEMENT_PDF = _FIXTURE_DIR / "bac_credit_synthetic.pdf"


def _load_goldens_module():
    spec = importlib.util.spec_from_file_location(
        "bac_credit_acceptance_bar_goldens", _GOLDENS_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _pdf_storage_base() -> Path:
    return Path(os.environ.get("PDF_STORAGE_PATH", "/data/pdfs"))


@pytest.fixture(autouse=True)
def _clean_pdf_storage() -> Iterator[None]:
    """Don't leave test litter on the operator's disk (Task 6.4)."""
    base = _pdf_storage_base()
    before = set(base.iterdir()) if base.exists() else set()
    yield
    after = set(base.iterdir()) if base.exists() else set()
    for new_entry in after - before:
        shutil.rmtree(new_entry, ignore_errors=True)


def _register(client: TestClient, email: str) -> None:
    response = client.post("/auth/register", json={"email": email, "password": "password1"})
    assert response.status_code == 201, response.text
    claim_alias(client, email)


def _own_list_id(client: TestClient) -> str:
    listed = client.get("/lists")
    assert listed.status_code == 200, listed.text
    return listed.json()["lists"][0]["id"]


def _upload_bac_session(client: TestClient) -> str:
    with _ACCEPTANCE_BAR_PDF.open("rb") as fh:
        created = client.post(
            "/import/sessions",
            files={"file": ("bac_credit_acceptance_bar.pdf", fh, "application/pdf")},
        )
    assert created.status_code == 201, created.text
    return created.json()["id"]


def test_unauthenticated_rejected_on_both_routes(client: TestClient) -> None:
    upload = client.post(
        "/import/sessions", files={"file": ("statement.pdf", b"%PDF-1.4\n", "application/pdf")}
    )
    assert upload.status_code == 401

    discard = client.delete(f"/import/sessions/{uuid4()}")
    assert discard.status_code == 401

    bulk_commit = client.post(
        f"/import/sessions/{uuid4()}/bulk-commit", json={"list_id": str(uuid4())}
    )
    assert bulk_commit.status_code == 401


def test_upload_non_pdf_bytes_rejected_content_based(client: TestClient) -> None:
    _register(client, "uploadbadtype@example.com")

    response = client.post(
        "/import/sessions",
        files={"file": ("statement.pdf", b"this is not a pdf", "application/pdf")},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "unsupported_file_type"


def test_upload_unrecognized_pdf_rejected_unknown_bank_adapter(client: TestClient) -> None:
    _register(client, "uploadunknown@example.com")

    response = client.post(
        "/import/sessions",
        files={
            "file": (
                "generic_statement.pdf",
                b"%PDF-1.4\n%generic pdf with no recognizable bank marker\n",
                "application/pdf",
            )
        },
    )
    assert response.status_code == 422
    assert response.json()["code"] == "unknown_bank_adapter"


def test_upload_real_bac_fixture_happy_path(client: TestClient) -> None:
    _register(client, "uploadbachappy@example.com")
    goldens = _load_goldens_module()

    with _ACCEPTANCE_BAR_PDF.open("rb") as fh:
        response = client.post(
            "/import/sessions",
            files={"file": ("bac_credit_acceptance_bar.pdf", fh, "application/pdf")},
        )

    assert response.status_code == 201, response.text
    body = response.json()
    assert len(body["statements"]) == 1
    statement = body["statements"][0]
    assert statement["status"] == "staged"
    assert statement["candidate_row_count"] == len(goldens.GOLDENS)


def test_discard_nonexistent_session_not_found(client: TestClient) -> None:
    _register(client, "discardmissing@example.com")

    response = client.delete(f"/import/sessions/{uuid4()}")
    assert response.status_code == 404
    assert response.json()["code"] == "import_session_not_found"


def test_discard_foreign_session_not_found(client: TestClient) -> None:
    _register(client, "discardownera@example.com")
    with _ACCEPTANCE_BAR_PDF.open("rb") as fh:
        created = client.post(
            "/import/sessions",
            files={"file": ("bac_credit_acceptance_bar.pdf", fh, "application/pdf")},
        )
    session_id = created.json()["id"]

    client.post("/auth/sign-out")
    _register(client, "discardownerb@example.com")
    response = client.delete(f"/import/sessions/{session_id}")
    assert response.status_code == 404
    assert response.json()["code"] == "import_session_not_found"


def test_discard_own_session_succeeds(client: TestClient) -> None:
    _register(client, "discardowner@example.com")
    with _ACCEPTANCE_BAR_PDF.open("rb") as fh:
        created = client.post(
            "/import/sessions",
            files={"file": ("bac_credit_acceptance_bar.pdf", fh, "application/pdf")},
        )
    session_id = created.json()["id"]

    response = client.delete(f"/import/sessions/{session_id}")
    assert response.status_code == 200, response.text
    assert response.json()["discarded_at"] is not None


def test_upload_multi_statement_pdf_completes_within_interactive_session(
    client: TestClient,
) -> None:
    """NFR-12: upload -> detect/split -> parse(all statements) is not an
    overnight-batch job — real adapters, real 3-statement BAC fixture."""
    _register(client, "uploadtiming@example.com")

    with _SYNTHETIC_MULTI_STATEMENT_PDF.open("rb") as fh:
        started = time.monotonic()
        response = client.post(
            "/import/sessions",
            files={"file": ("bac_credit_synthetic.pdf", fh, "application/pdf")},
        )
        elapsed = time.monotonic() - started

    assert response.status_code == 201, response.text
    assert len(response.json()["statements"]) == 3
    assert elapsed < 5.0, f"upload+detect/split/parse took {elapsed:.2f}s — exceeds NFR-12 budget"


# --- Story 4.7: Bulk review assign & commit path ------------------------------------


def test_bulk_commit_non_crc_row_without_bccr_wired_fails_loud_503(client: TestClient) -> None:
    """No live BCCR adapter yet (Dev Notes) — a non-CRC candidate row must 503,
    never silently commit at a 1:1 rate (AD-7 fail loud)."""
    _register(client, "bulknofx@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)

    response = client.post(f"/import/sessions/{session_id}/bulk-commit", json={"list_id": list_id})
    assert response.status_code == 503
    assert response.json()["code"] == "fx_service_unavailable"


def test_bulk_commit_happy_path_lands_ledger_rows_payer_is_actor(
    client_with_fx: TestClient,
    db_session: Session,
) -> None:
    client = client_with_fx
    _register(client, "bulkhappy@example.com")
    goldens = _load_goldens_module()
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)

    response = client.post(f"/import/sessions/{session_id}/bulk-commit", json={"list_id": list_id})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["session_id"] == session_id
    assert body["list_id"] == list_id
    assert len(body["batches"]) == 1
    batch_id = body["batches"][0]["id"]
    assert body["batches"][0]["ledger_entry_count"] == len(goldens.GOLDENS)

    expenses = client.get(f"/lists/{list_id}/expenses")
    assert expenses.status_code == 200, expenses.text
    rows = expenses.json()["expenses"]
    assert len(rows) == len(goldens.GOLDENS)
    me = client.get("/auth/me").json()
    assert all(row["payer_id"] == me["user_id"] for row in rows)
    assert all(row["provenance"] == "parser" for row in rows)

    # Story 4.7 review finding: AD-4's central guarantee (a committed ledger
    # row traces back to the batch that created it) is not exposed via the
    # API — assert it directly against the DB column.
    ledger_rows = db_session.scalars(
        select(LedgerEntryModel).where(LedgerEntryModel.list_id == UUID(list_id))
    ).all()
    assert len(ledger_rows) == len(goldens.GOLDENS)
    assert all(str(row.import_batch_id) == batch_id for row in ledger_rows)


def test_bulk_commit_duplicate_batch_insert_raises_already_committed_not_integrity_error(
    client_with_fx: TestClient,
    db_session: Session,
) -> None:
    """Story 4.7 review finding: two concurrent bulk-commit requests for the
    same statement can both pass validate_bulk_commit_eligible before either
    persists — uq_import_batches_statement_id is the real backstop.
    Simulate the race by calling the repository directly a second time for
    an already-committed statement and assert it surfaces the same clean
    domain error the sequential double-commit path already returns, not a
    bare IntegrityError."""
    client = client_with_fx
    _register(client, "bulkrace@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)
    actor_id = client.get("/auth/me").json()["user_id"]

    first = client.post(f"/import/sessions/{session_id}/bulk-commit", json={"list_id": list_id})
    assert first.status_code == 200, first.text
    statement_id = first.json()["batches"][0]["statement_id"]

    repo = SqlAlchemyImportSessionRepository(db_session)
    with pytest.raises(ImportSessionAlreadyCommittedError):
        repo.commit_statement_batch(
            batch_id=uuid4(),
            session_id=UUID(session_id),
            statement_id=UUID(statement_id),
            list_id=UUID(list_id),
            actor_user_id=UUID(actor_id),
            rows=[],
        )


def test_bulk_commit_non_member_list_denied(client: TestClient) -> None:
    _register(client, "bulknonmembera@example.com")
    other_list_id = _own_list_id(client)

    client.post("/auth/sign-out")
    _register(client, "bulknonmemberb@example.com")
    session_id = _upload_bac_session(client)

    response = client.post(
        f"/import/sessions/{session_id}/bulk-commit", json={"list_id": other_list_id}
    )
    assert response.status_code == 403
    assert response.json()["code"] == "not_list_member"


def test_bulk_commit_nonexistent_session_not_found(client: TestClient) -> None:
    _register(client, "bulkmissing@example.com")
    list_id = _own_list_id(client)

    response = client.post(f"/import/sessions/{uuid4()}/bulk-commit", json={"list_id": list_id})
    assert response.status_code == 404
    assert response.json()["code"] == "import_session_not_found"


def test_bulk_commit_discarded_session_rejected(client: TestClient) -> None:
    _register(client, "bulkdiscarded@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)
    client.delete(f"/import/sessions/{session_id}")

    response = client.post(f"/import/sessions/{session_id}/bulk-commit", json={"list_id": list_id})
    assert response.status_code == 409
    assert response.json()["code"] == "import_session_discarded"


def test_bulk_commit_twice_rejected_no_double_commit(client_with_fx: TestClient) -> None:
    client = client_with_fx
    _register(client, "bulktwice@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)

    first = client.post(f"/import/sessions/{session_id}/bulk-commit", json={"list_id": list_id})
    assert first.status_code == 200, first.text

    second = client.post(f"/import/sessions/{session_id}/bulk-commit", json={"list_id": list_id})
    assert second.status_code == 409
    assert second.json()["code"] == "import_session_already_committed"

    expenses = client.get(f"/lists/{list_id}/expenses")
    goldens = _load_goldens_module()
    assert len(expenses.json()["expenses"]) == len(goldens.GOLDENS)
