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
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from tests.integration_db import claim_alias, database_url

pytestmark = pytest.mark.skipif(
    database_url() is None,
    reason="DATABASE_URL not set — Postgres 16 required for integration tests",
)

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


def test_unauthenticated_rejected_on_both_routes(client: TestClient) -> None:
    upload = client.post(
        "/import/sessions", files={"file": ("statement.pdf", b"%PDF-1.4\n", "application/pdf")}
    )
    assert upload.status_code == 401

    discard = client.delete(f"/import/sessions/{uuid4()}")
    assert discard.status_code == 401


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
