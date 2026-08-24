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
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

import pytest
from adapters.persistence.import_sessions import SqlAlchemyImportSessionRepository
from adapters.persistence.models import (
    ImportBatchModel,
    ImportCandidateRowModel,
    ImportStatementModel,
    LedgerEntryModel,
)
from adapters.persistence.repositories import SqlAlchemyListRepository
from adapters.storage.pdf_storage import FilesystemPdfStorage
from application.fx_service import MaterializedFx, MaterializeFxService
from application.import_session import (
    AssignCandidateRowCommand,
    AssignCandidateRowService,
    CommitRow,
    DeleteCandidateRowCommand,
    DeleteCandidateRowService,
    DetectedStatement,
)
from domain.canonical_line import CanonicalLine, canonical_identity_key
from domain.errors import ImportRowNotAvailableError
from domain.expenses import ManualExpenseDraft
from domain.import_session import (
    ROW_STATUS_COMMITTED,
    ROW_STATUS_DELETED,
    ROW_STATUS_EXCLUDED_ZERO_AMOUNT,
    ROW_STATUS_PENDING,
    STATEMENT_STATUS_COMMITTED,
    STATEMENT_STATUS_FAILED,
    STATEMENT_STATUS_STAGED,
)
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


def _assert_source_pdf_released(db_session: Session, *, session_id: str, user_id: str) -> None:
    user_dir = _pdf_storage_base() / user_id
    leftover = list(user_dir.glob("*.pdf")) if user_dir.exists() else []
    assert leftover == []
    db_session.expire_all()
    statement_rows = db_session.scalars(
        select(ImportStatementModel).where(ImportStatementModel.session_id == UUID(session_id))
    ).all()
    assert statement_rows
    assert all(row.pdf_path is None for row in statement_rows)


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

    get_session = client.get(f"/import/sessions/{uuid4()}")
    assert get_session.status_code == 401

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
    assert all(row.import_candidate_row_id is not None for row in ledger_rows)
    assert len({row.import_candidate_row_id for row in ledger_rows}) == len(ledger_rows)
    assert all(row.origin_kind is None for row in ledger_rows)
    assert all(row.origin_card_id is None for row in ledger_rows)

    _assert_source_pdf_released(db_session, session_id=session_id, user_id=me["user_id"])


def test_bulk_commit_duplicate_row_insert_raises_not_available_not_integrity_error(
    client_with_fx: TestClient,
    db_session: Session,
) -> None:
    """Story 4.10 AC #6: after a successful commit, a second
    commit_statement_batch for the same candidate_row_id raises
    ImportRowNotAvailableError, not a bare IntegrityError."""
    client = client_with_fx
    _register(client, "bulkrace@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)
    actor_id = client.get("/auth/me").json()["user_id"]

    first = client.post(f"/import/sessions/{session_id}/bulk-commit", json={"list_id": list_id})
    assert first.status_code == 200, first.text
    statement_id = first.json()["batches"][0]["statement_id"]

    already = db_session.scalars(
        select(ImportCandidateRowModel).where(
            ImportCandidateRowModel.statement_id == UUID(statement_id)
        )
    ).first()
    assert already is not None

    repo = SqlAlchemyImportSessionRepository(db_session)
    with pytest.raises(ImportRowNotAvailableError):
        repo.commit_statement_batch(
            batch_id=uuid4(),
            session_id=UUID(session_id),
            statement_id=UUID(statement_id),
            list_id=UUID(list_id),
            actor_user_id=UUID(actor_id),
            rows=[
                CommitRow(
                    candidate_row_id=already.id,
                    draft=ManualExpenseDraft(
                        amount=Decimal(str(already.amount)),
                        currency=already.currency,
                        normalized_description=already.normalized_description,
                        payer_id=UUID(actor_id),
                        provenance=already.provenance,
                        line_type=already.line_type,
                        posted_date=already.posted_date.isoformat(),
                        external_ref=already.external_ref,
                    ),
                    fx=MaterializedFx(
                        amount_crc=Decimal(str(already.amount)),
                        fx_rate=Decimal("1"),
                        fx_rate_date=already.posted_date,
                        fx_fallback=False,
                    ),
                    identity=canonical_identity_key(_line_of(already)),
                )
            ],
        )


def test_bulk_commit_ledger_unique_backstop_raises_not_available(
    client_with_fx: TestClient,
    db_session: Session,
) -> None:
    """Story 4.10 AC #6, layer 2: the guarded UPDATE is not the only defense.

    The sibling test above exercises layer 1 only — it targets an already
    `committed` row, so the guarded UPDATE raises before any ledger INSERT
    runs and `uq_ledger_entries_import_candidate_row_id` is never touched.
    Here the candidate row is left `pending` while a ledger entry already
    claims it, which is exactly the state two concurrent commits produce
    after both pass the UPDATE. The INSERT must violate the unique and
    surface as ImportRowNotAvailableError, not a bare IntegrityError.
    """
    client = client_with_fx
    _register(client, "bulkbackstop@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)
    actor_id = client.get("/auth/me").json()["user_id"]

    statement = db_session.scalars(
        select(ImportStatementModel).where(ImportStatementModel.session_id == UUID(session_id))
    ).first()
    assert statement is not None
    pending = db_session.scalars(
        select(ImportCandidateRowModel).where(
            ImportCandidateRowModel.statement_id == statement.id,
            ImportCandidateRowModel.status == ROW_STATUS_PENDING,
        )
    ).first()
    assert pending is not None

    # Pre-claim the row in the ledger without touching its status — the row
    # stays `pending`, so layer 1 lets the commit through.
    db_session.add(
        LedgerEntryModel(
            id=uuid4(),
            list_id=UUID(list_id),
            amount=Decimal(str(pending.amount)),
            currency=pending.currency,
            normalized_description=pending.normalized_description,
            payer_id=UUID(actor_id),
            provenance=pending.provenance,
            line_type=pending.line_type,
            posted_date=pending.posted_date,
            receipt_id=None,
            product_id=None,
            external_ref=pending.external_ref,
            origin_kind=None,
            origin_card_id=None,
            import_batch_id=None,
            import_candidate_row_id=pending.id,
            amount_crc=Decimal(str(pending.amount)),
            fx_rate=Decimal("1"),
            fx_rate_date=pending.posted_date,
            fx_fallback=False,
            created_at=datetime.now(UTC),
        )
    )
    db_session.flush()

    repo = SqlAlchemyImportSessionRepository(db_session)
    with pytest.raises(ImportRowNotAvailableError):
        repo.commit_statement_batch(
            batch_id=uuid4(),
            session_id=UUID(session_id),
            statement_id=statement.id,
            list_id=UUID(list_id),
            actor_user_id=UUID(actor_id),
            rows=[
                CommitRow(
                    candidate_row_id=pending.id,
                    draft=ManualExpenseDraft(
                        amount=Decimal(str(pending.amount)),
                        currency=pending.currency,
                        normalized_description=pending.normalized_description,
                        payer_id=UUID(actor_id),
                        provenance=pending.provenance,
                        line_type=pending.line_type,
                        posted_date=pending.posted_date.isoformat(),
                        external_ref=pending.external_ref,
                    ),
                    fx=MaterializedFx(
                        amount_crc=Decimal(str(pending.amount)),
                        fx_rate=Decimal("1"),
                        fx_rate_date=pending.posted_date,
                        fx_fallback=False,
                    ),
                    identity=canonical_identity_key(_line_of(pending)),
                )
            ],
        )

    # The SAVEPOINT must roll the status flip and the batch INSERT back too —
    # otherwise the row is stranded `committed` with no ledger entry and can
    # never be re-committed (Story 4.10 review).
    db_session.refresh(pending)
    assert pending.status == ROW_STATUS_PENDING


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
    assert second.status_code == 422
    assert second.json()["code"] == "no_clean_statements_to_commit"

    expenses = client.get(f"/lists/{list_id}/expenses")
    goldens = _load_goldens_module()
    assert len(expenses.json()["expenses"]) == len(goldens.GOLDENS)


# --- Story 4.8: Individual review (swipe / desktop buttons) -----------------------


def test_get_import_session_round_trip(client: TestClient) -> None:
    _register(client, "getsession@example.com")
    session_id = _upload_bac_session(client)

    response = client.get(f"/import/sessions/{session_id}")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == session_id
    assert len(body["statements"]) == 1
    assert body["statements"][0]["status"] == "staged"


def test_get_nonexistent_session_not_found(client: TestClient) -> None:
    _register(client, "getmissing@example.com")

    response = client.get(f"/import/sessions/{uuid4()}")
    assert response.status_code == 404
    assert response.json()["code"] == "import_session_not_found"


def test_get_foreign_session_not_found(client: TestClient) -> None:
    _register(client, "getownera@example.com")
    session_id = _upload_bac_session(client)

    client.post("/auth/sign-out")
    _register(client, "getownerb@example.com")
    response = client.get(f"/import/sessions/{session_id}")
    assert response.status_code == 404
    assert response.json()["code"] == "import_session_not_found"


def _line_of(candidate: ImportCandidateRowModel) -> CanonicalLine:
    """The CanonicalLine a persisted candidate row came from — needed wherever a
    test builds a CommitRow by hand and must supply the same identity the
    services would compute (Story 4.12)."""
    return CanonicalLine(
        posted_date=candidate.posted_date.isoformat(),
        amount=Decimal(str(candidate.amount)),
        currency=candidate.currency,
        product_id=candidate.statement.product_id,
        line_type=candidate.line_type,
        normalized_description=candidate.normalized_description,
        provenance=candidate.provenance,
        external_ref=candidate.external_ref,
        ref_quality=candidate.ref_quality,
    )


def _services(db_session: Session):
    repo = SqlAlchemyImportSessionRepository(db_session)
    lookup = SqlAlchemyListRepository(db_session)
    fx = MaterializeFxService(_FakeUsdBccrClient())
    storage = FilesystemPdfStorage(base_dir=os.environ["PDF_STORAGE_PATH"])
    return repo, lookup, fx, storage


def test_create_session_persists_zero_amount_as_excluded_and_keeps_count(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "zerorow@example.com")
    user_id = UUID(client.get("/auth/me").json()["user_id"])
    repo = SqlAlchemyImportSessionRepository(db_session)
    zero = CanonicalLine(
        posted_date="2026-01-01",
        amount=Decimal("0.00"),
        currency="CRC",
        product_id="fake_product",
        line_type="purchase",
        normalized_description="zero",
    )
    keep = CanonicalLine(
        posted_date="2026-01-01",
        amount=Decimal("10.00"),
        currency="CRC",
        product_id="fake_product",
        line_type="purchase",
        normalized_description="keep",
    )
    record = repo.create_session(
        session_id=uuid4(),
        user_id=user_id,
        statements=[
            DetectedStatement(
                product_id="fake_product",
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=[zero, keep],
                original_filename="estado.pdf",
            )
        ],
        pdf_paths={0: "/data/pdfs/zero-test.pdf"},
    )
    rows = record.statements[0].candidate_rows
    assert len(rows) == 2
    assert rows[0].sequence == 0
    assert rows[0].status == ROW_STATUS_EXCLUDED_ZERO_AMOUNT
    assert rows[1].sequence == 1
    assert rows[1].status == ROW_STATUS_PENDING
    assert record.statements[0].status == STATEMENT_STATUS_STAGED
    assert record.statements[0].candidate_row_count == 2
    assert record.statements[0].original_filename == "estado.pdf"


def test_create_session_all_zero_statement_committed_without_batch(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "allzero@example.com")
    user_id = UUID(client.get("/auth/me").json()["user_id"])
    repo = SqlAlchemyImportSessionRepository(db_session)
    zero = CanonicalLine(
        posted_date="2026-01-01",
        amount=Decimal("0.00"),
        currency="CRC",
        product_id="fake_product",
        line_type="purchase",
        normalized_description="zero",
    )
    record = repo.create_session(
        session_id=uuid4(),
        user_id=user_id,
        statements=[
            DetectedStatement(
                product_id="fake_product",
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=[zero],
            )
        ],
        pdf_paths={0: "/data/pdfs/all-zero.pdf"},
    )
    assert record.statements[0].status == STATEMENT_STATUS_COMMITTED
    assert record.statements[0].candidate_rows[0].status == ROW_STATUS_EXCLUDED_ZERO_AMOUNT

    batches = db_session.scalars(
        select(ImportBatchModel).where(ImportBatchModel.session_id == record.id)
    ).all()
    assert batches == []


def test_assign_candidate_row_one_batch_siblings_pending_pdf_retained(
    client_with_fx: TestClient, db_session: Session
) -> None:
    client = client_with_fx
    _register(client, "rowassign@example.com")
    session_id = UUID(_upload_bac_session(client))
    list_id = UUID(_own_list_id(client))
    actor_id = UUID(client.get("/auth/me").json()["user_id"])
    repo, lookup, fx, storage = _services(db_session)

    statement = db_session.scalars(
        select(ImportStatementModel).where(ImportStatementModel.session_id == session_id)
    ).one()
    candidates = list(
        db_session.scalars(
            select(ImportCandidateRowModel)
            .where(ImportCandidateRowModel.statement_id == statement.id)
            .order_by(ImportCandidateRowModel.sequence)
        )
    )
    assert len(candidates) >= 2
    first, second = candidates[0], candidates[1]

    result = AssignCandidateRowService(repo, lookup, fx).execute(
        AssignCandidateRowCommand(
            actor_user_id=actor_id, session_id=session_id, row_id=first.id, list_id=list_id
        )
    )
    assert result.batch is not None
    assert len(result.batch.ledger_entry_ids) == 1
    db_session.expire_all()
    refreshed = db_session.get(ImportCandidateRowModel, first.id)
    sibling = db_session.get(ImportCandidateRowModel, second.id)
    statement = db_session.get(ImportStatementModel, statement.id)
    assert refreshed is not None and refreshed.status == ROW_STATUS_COMMITTED
    assert sibling is not None and sibling.status == ROW_STATUS_PENDING
    assert statement is not None and statement.status == STATEMENT_STATUS_STAGED
    assert statement.pdf_path is not None


def test_delete_all_pending_rows_commits_statement(client: TestClient, db_session: Session) -> None:
    _register(client, "rowdelete@example.com")
    session_id = UUID(_upload_bac_session(client))
    actor_id = UUID(client.get("/auth/me").json()["user_id"])
    repo, _, _, storage = _services(db_session)
    statement = db_session.scalars(
        select(ImportStatementModel).where(ImportStatementModel.session_id == session_id)
    ).one()
    candidates = list(
        db_session.scalars(
            select(ImportCandidateRowModel).where(
                ImportCandidateRowModel.statement_id == statement.id
            )
        )
    )
    service = DeleteCandidateRowService(repo)
    for candidate in candidates:
        service.execute(
            DeleteCandidateRowCommand(
                actor_user_id=actor_id, session_id=session_id, row_id=candidate.id
            )
        )
    db_session.expire_all()
    statement = db_session.get(ImportStatementModel, statement.id)
    assert statement is not None
    assert statement.status == STATEMENT_STATUS_COMMITTED
    statuses = list(
        db_session.scalars(
            select(ImportCandidateRowModel.status).where(
                ImportCandidateRowModel.statement_id == statement.id
            )
        )
    )
    assert set(statuses) == {ROW_STATUS_DELETED}


def test_dismiss_after_partial_row_commit_leaves_committed_ledger_untouched(
    client_with_fx: TestClient, db_session: Session
) -> None:
    client = client_with_fx
    _register(client, "rowdismiss@example.com")
    session_id = UUID(_upload_bac_session(client))
    list_id = UUID(_own_list_id(client))
    actor_id = UUID(client.get("/auth/me").json()["user_id"])
    repo, lookup, fx, storage = _services(db_session)
    statement = db_session.scalars(
        select(ImportStatementModel).where(ImportStatementModel.session_id == session_id)
    ).one()
    first = db_session.scalars(
        select(ImportCandidateRowModel)
        .where(ImportCandidateRowModel.statement_id == statement.id)
        .order_by(ImportCandidateRowModel.sequence)
    ).first()
    assert first is not None
    AssignCandidateRowService(repo, lookup, fx).execute(
        AssignCandidateRowCommand(
            actor_user_id=actor_id, session_id=session_id, row_id=first.id, list_id=list_id
        )
    )

    dismissed = client.delete(f"/import/sessions/{session_id}")
    assert dismissed.status_code == 200, dismissed.text
    assert dismissed.json()["discarded_at"] is not None

    ledger_rows = db_session.scalars(
        select(LedgerEntryModel).where(LedgerEntryModel.list_id == list_id)
    ).all()
    assert len(ledger_rows) == 1
    assert ledger_rows[0].import_candidate_row_id == first.id


_IDENTIFY_IBAN = "CR03010202412935924228"


def _crc_line(description: str = "keep") -> CanonicalLine:
    return CanonicalLine(
        posted_date="2026-01-01",
        amount=Decimal("10.00"),
        currency="CRC",
        product_id="fake_product",
        line_type="purchase",
        normalized_description=description,
    )


def test_identify_card_register_persists_card_id_and_bulk_stamps_origin(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "originregister@example.com")
    user_id = UUID(client.get("/auth/me").json()["user_id"])
    list_id = _own_list_id(client)
    repo = SqlAlchemyImportSessionRepository(db_session)
    record = repo.create_session(
        session_id=uuid4(),
        user_id=user_id,
        statements=[
            DetectedStatement(
                product_id="fake_product",
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=[_crc_line()],
                iban=_IDENTIFY_IBAN,
            )
        ],
        pdf_paths={0: "/data/pdfs/origin-register.pdf"},
    )
    statement_id = record.statements[0].id

    identified = client.post(
        f"/import/sessions/{record.id}/statements/{statement_id}/identify-card",
        json={"label": "My Visa"},
    )
    assert identified.status_code == 200, identified.text
    card_id = identified.json()["card_id"]
    assert identified.json()["matched"] is True

    fetched = client.get(f"/import/sessions/{record.id}")
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["statements"][0]["card_id"] == card_id

    committed = client.post(f"/import/sessions/{record.id}/bulk-commit", json={"list_id": list_id})
    assert committed.status_code == 200, committed.text

    ledger_rows = db_session.scalars(
        select(LedgerEntryModel).where(LedgerEntryModel.list_id == UUID(list_id))
    ).all()
    assert len(ledger_rows) == 1
    assert ledger_rows[0].origin_kind == "card"
    assert str(ledger_rows[0].origin_card_id) == card_id


def test_identify_card_match_persists_existing_card_id(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "originmatch@example.com")
    user_id = UUID(client.get("/auth/me").json()["user_id"])
    created = client.post("/cards", json={"label": "My Visa", "iban": _IDENTIFY_IBAN})
    assert created.status_code == 201, created.text
    card_id = created.json()["id"]
    repo = SqlAlchemyImportSessionRepository(db_session)
    record = repo.create_session(
        session_id=uuid4(),
        user_id=user_id,
        statements=[
            DetectedStatement(
                product_id="fake_product",
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=[_crc_line()],
                iban=_IDENTIFY_IBAN,
            )
        ],
        pdf_paths={0: "/data/pdfs/origin-match.pdf"},
    )
    statement_id = record.statements[0].id

    identified = client.post(
        f"/import/sessions/{record.id}/statements/{statement_id}/identify-card",
        json={},
    )
    assert identified.status_code == 200, identified.text
    assert identified.json()["card_id"] == card_id

    fetched = client.get(f"/import/sessions/{record.id}")
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["statements"][0]["card_id"] == card_id


def _pending_rows(payload: dict) -> list[dict]:
    return list(payload["statements"][0]["rows"])


def test_get_session_rows_are_pending_only_ordered_amounts_are_strings(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "getrows@example.com")
    session_id = _upload_bac_session(client)
    payload = client.get(f"/import/sessions/{session_id}").json()
    statement = payload["statements"][0]
    rows = statement["rows"]
    sequences = [row["sequence"] for row in rows]
    assert sequences == sorted(sequences)
    assert all(row["status"] == ROW_STATUS_PENDING for row in rows)
    assert all(isinstance(row["amount"], str) for row in rows)
    for row in rows:
        Decimal(row["amount"])
    db_session.expire_all()
    excluded = db_session.scalars(
        select(ImportCandidateRowModel).where(
            ImportCandidateRowModel.statement_id == UUID(statement["id"]),
            ImportCandidateRowModel.status == ROW_STATUS_EXCLUDED_ZERO_AMOUNT,
        )
    ).all()
    assert statement["zero_amount_excluded_count"] == len(excluded)
    assert payload["undo"] is None


def test_assign_row_sets_undo_pointer_and_ledger_candidate_id(
    client_with_fx: TestClient, db_session: Session
) -> None:
    client = client_with_fx
    _register(client, "rowhttpassign@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)
    row = _pending_rows(client.get(f"/import/sessions/{session_id}").json())[0]

    assigned = client.post(
        f"/import/sessions/{session_id}/rows/{row['id']}/assign",
        json={"list_id": list_id},
    )
    assert assigned.status_code == 200, assigned.text
    body = assigned.json()
    assert body["undo"] == {"row_id": row["id"], "action": "assign"}
    assert all(item["id"] != row["id"] for item in body["statements"][0]["rows"])

    db_session.expire_all()
    candidate = db_session.get(ImportCandidateRowModel, UUID(row["id"]))
    assert candidate is not None and candidate.status == ROW_STATUS_COMMITTED
    ledger = db_session.scalars(
        select(LedgerEntryModel).where(LedgerEntryModel.import_candidate_row_id == UUID(row["id"]))
    ).one()
    assert ledger.import_candidate_row_id == UUID(row["id"])


def test_assign_then_undo_restores_pending_and_hard_deletes_ledger(
    client_with_fx: TestClient, db_session: Session
) -> None:
    client = client_with_fx
    _register(client, "rowundoleger@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)
    row = _pending_rows(client.get(f"/import/sessions/{session_id}").json())[0]
    assigned = client.post(
        f"/import/sessions/{session_id}/rows/{row['id']}/assign",
        json={"list_id": list_id},
    )
    assert assigned.status_code == 200, assigned.text

    undone = client.post(f"/import/sessions/{session_id}/undo")
    assert undone.status_code == 200, undone.text
    body = undone.json()
    assert body["undo"] is None
    restored = next(item for item in body["statements"][0]["rows"] if item["id"] == row["id"])
    assert restored["status"] == ROW_STATUS_PENDING
    assert body["statements"][0]["status"] == STATEMENT_STATUS_STAGED

    db_session.expire_all()
    assert (
        db_session.scalars(
            select(LedgerEntryModel).where(
                LedgerEntryModel.import_candidate_row_id == UUID(row["id"])
            )
        ).first()
        is None
    )
    batches = db_session.scalars(
        select(ImportBatchModel).where(ImportBatchModel.session_id == UUID(session_id))
    ).all()
    assert batches == []

    again = client.post(
        f"/import/sessions/{session_id}/rows/{row['id']}/assign",
        json={"list_id": list_id},
    )
    assert again.status_code == 200, again.text


def test_delete_then_undo_restores_pending_row(client: TestClient) -> None:
    _register(client, "rowundodelete@example.com")
    session_id = _upload_bac_session(client)
    row = _pending_rows(client.get(f"/import/sessions/{session_id}").json())[0]
    deleted = client.post(f"/import/sessions/{session_id}/rows/{row['id']}/delete")
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["undo"] == {"row_id": row["id"], "action": "delete"}

    undone = client.post(f"/import/sessions/{session_id}/undo")
    assert undone.status_code == 200, undone.text
    restored = next(
        item for item in undone.json()["statements"][0]["rows"] if item["id"] == row["id"]
    )
    assert restored["status"] == ROW_STATUS_PENDING


def test_undo_last_row_reopens_committed_statement(
    client_with_fx: TestClient, db_session: Session
) -> None:
    """Assigning the only pending row commits the statement; undo must stage it
    again so the restored row re-enters GET `rows`."""
    client = client_with_fx
    _register(client, "rowundoreopen@example.com")
    user_id = UUID(client.get("/auth/me").json()["user_id"])
    list_id = _own_list_id(client)
    repo = SqlAlchemyImportSessionRepository(db_session)
    record = repo.create_session(
        session_id=uuid4(),
        user_id=user_id,
        statements=[
            DetectedStatement(
                product_id="fake_product",
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=[_crc_line("only")],
            )
        ],
        pdf_paths={0: "/data/pdfs/undo-reopen.pdf"},
    )
    row_id = record.statements[0].candidate_rows[0].id
    assigned = client.post(
        f"/import/sessions/{record.id}/rows/{row_id}/assign",
        json={"list_id": list_id},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["statements"][0]["status"] == STATEMENT_STATUS_COMMITTED
    assert assigned.json()["statements"][0]["rows"] == []

    undone = client.post(f"/import/sessions/{record.id}/undo")
    assert undone.status_code == 200, undone.text
    body = undone.json()
    assert body["statements"][0]["status"] == STATEMENT_STATUS_STAGED
    restored = next(item for item in body["statements"][0]["rows"] if item["id"] == str(row_id))
    assert restored["status"] == ROW_STATUS_PENDING


def test_undo_twice_returns_nothing_to_undo(client: TestClient) -> None:
    _register(client, "rowundotwice@example.com")
    session_id = _upload_bac_session(client)
    row = _pending_rows(client.get(f"/import/sessions/{session_id}").json())[0]
    assert client.post(f"/import/sessions/{session_id}/rows/{row['id']}/delete").status_code == 200
    assert client.post(f"/import/sessions/{session_id}/undo").status_code == 200
    second = client.post(f"/import/sessions/{session_id}/undo")
    assert second.status_code == 409
    assert second.json()["code"] == "import_nothing_to_undo"


def test_undo_after_bulk_commit_is_nothing_to_undo(
    client_with_fx: TestClient, db_session: Session
) -> None:
    """A successful bulk commit clears a row-grain undo pointer (superseded)."""
    client = client_with_fx
    _register(client, "rowundobulk@example.com")
    user_id = UUID(client.get("/auth/me").json()["user_id"])
    list_id = _own_list_id(client)
    repo = SqlAlchemyImportSessionRepository(db_session)
    record = repo.create_session(
        session_id=uuid4(),
        user_id=user_id,
        statements=[
            DetectedStatement(
                product_id="fake_product",
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=[_crc_line("one")],
            ),
            DetectedStatement(
                product_id="fake_product",
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=[_crc_line("two")],
            ),
        ],
        pdf_paths={0: "/data/pdfs/undo-bulk-a.pdf", 1: "/data/pdfs/undo-bulk-b.pdf"},
    )
    first_row = record.statements[0].candidate_rows[0]
    assigned = client.post(
        f"/import/sessions/{record.id}/rows/{first_row.id}/assign",
        json={"list_id": list_id},
    )
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["undo"]["action"] == "assign"

    bulk = client.post(f"/import/sessions/{record.id}/bulk-commit", json={"list_id": list_id})
    assert bulk.status_code == 200, bulk.text
    undone = client.post(f"/import/sessions/{record.id}/undo")
    assert undone.status_code == 409
    assert undone.json()["code"] == "import_nothing_to_undo"


def test_patch_pending_row_updates_description_committed_row_rejected(
    client_with_fx: TestClient,
) -> None:
    client = client_with_fx
    _register(client, "rowpatchedit@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)
    rows = _pending_rows(client.get(f"/import/sessions/{session_id}").json())
    pending, sibling = rows[0], rows[1]

    patched = client.patch(
        f"/import/sessions/{session_id}/rows/{pending['id']}",
        json={"description": "  Corrected merchant  "},
    )
    assert patched.status_code == 200, patched.text
    echoed = next(
        item for item in patched.json()["statements"][0]["rows"] if item["id"] == pending["id"]
    )
    assert echoed["description"] == "Corrected merchant"
    fetched = client.get(f"/import/sessions/{session_id}").json()
    again = next(item for item in fetched["statements"][0]["rows"] if item["id"] == pending["id"])
    assert again["description"] == "Corrected merchant"

    assigned = client.post(
        f"/import/sessions/{session_id}/rows/{sibling['id']}/assign",
        json={"list_id": list_id},
    )
    assert assigned.status_code == 200, assigned.text
    rejected = client.patch(
        f"/import/sessions/{session_id}/rows/{sibling['id']}",
        json={"description": "too late"},
    )
    assert rejected.status_code == 409
    assert rejected.json()["code"] == "import_row_not_available"


def test_patch_discarded_session_rejected(client: TestClient) -> None:
    _register(client, "rowpatchdiscarded@example.com")
    session_id = _upload_bac_session(client)
    row = _pending_rows(client.get(f"/import/sessions/{session_id}").json())[0]
    discarded = client.delete(f"/import/sessions/{session_id}")
    assert discarded.status_code == 200, discarded.text
    patched = client.patch(
        f"/import/sessions/{session_id}/rows/{row['id']}",
        json={"description": "Coffee"},
    )
    assert patched.status_code == 409
    assert patched.json()["code"] == "import_session_discarded"


def test_assign_already_committed_row_not_available(client_with_fx: TestClient) -> None:
    client = client_with_fx
    _register(client, "rowassignagain@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)
    row = _pending_rows(client.get(f"/import/sessions/{session_id}").json())[0]
    first = client.post(
        f"/import/sessions/{session_id}/rows/{row['id']}/assign",
        json={"list_id": list_id},
    )
    assert first.status_code == 200, first.text
    second = client.post(
        f"/import/sessions/{session_id}/rows/{row['id']}/assign",
        json={"list_id": list_id},
    )
    assert second.status_code == 409
    assert second.json()["code"] == "import_row_not_available"


# --- Story 4.12: dedup identity, derived counts, finalize ---


def _assign(client: TestClient, session_id, row_id, list_id):
    return client.post(
        f"/import/sessions/{session_id}/rows/{row_id}/assign", json={"list_id": list_id}
    )


def _first_pending(client: TestClient, session_id) -> dict:
    return _pending_rows(client.get(f"/import/sessions/{session_id}").json())[0]


def _identity_of(db_session: Session, row_id) -> str:
    candidate = db_session.get(ImportCandidateRowModel, UUID(str(row_id)))
    assert candidate is not None
    return canonical_identity_key(_line_of(candidate))


def test_assigned_row_carries_a_non_null_import_identity(
    client_with_fx: TestClient, db_session: Session
) -> None:
    client = client_with_fx
    _register(client, "identitywritten@example.com")
    session_id = _upload_bac_session(client)
    list_id = _own_list_id(client)
    row = _first_pending(client, session_id)

    assert _assign(client, session_id, row["id"], list_id).status_code == 200

    db_session.expire_all()
    ledger = db_session.scalars(
        select(LedgerEntryModel).where(LedgerEntryModel.import_candidate_row_id == UUID(row["id"]))
    ).one()
    assert ledger.import_identity is not None
    assert ledger.import_identity.startswith("v1:")


def test_reimport_into_same_list_skips_silently_with_200_and_no_second_ledger_row(
    client_with_fx: TestClient, db_session: Session
) -> None:
    """AC #3's core promise: no mid-import interruption. The duplicate assign is
    a 200, not an error — the row still leaves pending so review progresses, but
    no second ledger row and no batch are written."""
    client = client_with_fx
    _register(client, "reimportsame@example.com")
    list_id = _own_list_id(client)
    first_session = _upload_bac_session(client)
    first_row = _first_pending(client, first_session)
    identity = _identity_of(db_session, first_row["id"])
    assert _assign(client, first_session, first_row["id"], list_id).status_code == 200

    second_session = _upload_bac_session(client)
    duplicate = next(
        item
        for item in _pending_rows(client.get(f"/import/sessions/{second_session}").json())
        if _identity_of(db_session, item["id"]) == identity
    )
    batches_before = db_session.scalars(
        select(ImportBatchModel).where(ImportBatchModel.session_id == UUID(second_session))
    ).all()

    response = _assign(client, second_session, duplicate["id"], list_id)

    assert response.status_code == 200, response.text
    body = response.json()
    assert all(item["id"] != duplicate["id"] for item in body["statements"][0]["rows"])
    assert body["skipped_duplicate_count"] == 1
    assert body["imported_new_count"] == 0

    db_session.expire_all()
    candidate = db_session.get(ImportCandidateRowModel, UUID(duplicate["id"]))
    assert candidate is not None
    assert candidate.status == ROW_STATUS_COMMITTED
    assert candidate.dedup_skipped is True
    assert (
        db_session.scalars(
            select(LedgerEntryModel).where(
                LedgerEntryModel.import_candidate_row_id == UUID(duplicate["id"])
            )
        ).first()
        is None
    )
    assert (
        len(
            db_session.scalars(
                select(LedgerEntryModel).where(
                    LedgerEntryModel.list_id == UUID(list_id),
                    LedgerEntryModel.import_identity == identity,
                )
            ).all()
        )
        == 1
    )
    assert batches_before == []
    assert (
        db_session.scalars(
            select(ImportBatchModel).where(ImportBatchModel.session_id == UUID(second_session))
        ).all()
        == []
    )


def test_same_identity_into_a_different_list_does_commit(
    client_with_fx: TestClient, db_session: Session
) -> None:
    """Dedup is scoped to the destination list — a duplicate in list A cannot
    corrupt list B's balance, and re-import is currently the only informal way
    to repair a misrouted statement (revisit after 5.5 / 5.6)."""
    client = client_with_fx
    _register(client, "dedupperlist@example.com")
    list_a = _own_list_id(client)
    created = client.post("/lists", json={"name": "Second list"})
    assert created.status_code in (200, 201), created.text
    list_b = created.json()["id"]

    first_session = _upload_bac_session(client)
    first_row = _first_pending(client, first_session)
    identity = _identity_of(db_session, first_row["id"])
    assert _assign(client, first_session, first_row["id"], list_a).status_code == 200

    second_session = _upload_bac_session(client)
    twin = next(
        item
        for item in _pending_rows(client.get(f"/import/sessions/{second_session}").json())
        if _identity_of(db_session, item["id"]) == identity
    )
    response = _assign(client, second_session, twin["id"], list_b)

    assert response.status_code == 200, response.text
    assert response.json()["imported_new_count"] == 1
    db_session.expire_all()
    candidate = db_session.get(ImportCandidateRowModel, UUID(twin["id"]))
    assert candidate is not None and candidate.dedup_skipped is False
    assert (
        db_session.scalars(
            select(LedgerEntryModel).where(
                LedgerEntryModel.list_id == UUID(list_b),
                LedgerEntryModel.import_identity == identity,
            )
        ).first()
        is not None
    )


def test_bulk_commit_collapses_two_identical_rows_in_one_statement(
    client_with_fx: TestClient, db_session: Session
) -> None:
    """The database lookup only catches rows already committed, so identities
    claimed earlier in the same commit action must count too (AC #3)."""
    client = client_with_fx
    _register(client, "bulktwins@example.com")
    user_id = UUID(client.get("/auth/me").json()["user_id"])
    list_id = _own_list_id(client)
    repo = SqlAlchemyImportSessionRepository(db_session)
    record = repo.create_session(
        session_id=uuid4(),
        user_id=user_id,
        statements=[
            DetectedStatement(
                product_id="fake_product",
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=[_crc_line("twin"), _crc_line("twin")],
            )
        ],
        pdf_paths={0: None},
    )
    db_session.commit()

    response = client.post(f"/import/sessions/{record.id}/bulk-commit", json={"list_id": list_id})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["imported_new_count"] == 1
    assert body["skipped_duplicate_count"] == 1
    db_session.expire_all()
    entries = db_session.scalars(
        select(LedgerEntryModel).where(LedgerEntryModel.list_id == UUID(list_id))
    ).all()
    assert len(entries) == 1


def test_undo_of_a_duplicate_skipped_assign_moves_the_counts_back(
    client_with_fx: TestClient, db_session: Session
) -> None:
    """The interaction between 4.11's undo and this story's new state: an undone
    duplicate must return to pending *and* clear dedup_skipped, or it keeps
    counting against skipped_duplicate_count forever."""
    client = client_with_fx
    _register(client, "undoduplicate@example.com")
    list_id = _own_list_id(client)
    first_session = _upload_bac_session(client)
    first_row = _first_pending(client, first_session)
    identity = _identity_of(db_session, first_row["id"])
    assert _assign(client, first_session, first_row["id"], list_id).status_code == 200

    second_session = _upload_bac_session(client)
    duplicate = next(
        item
        for item in _pending_rows(client.get(f"/import/sessions/{second_session}").json())
        if _identity_of(db_session, item["id"]) == identity
    )
    skipped = _assign(client, second_session, duplicate["id"], list_id)
    assert skipped.json()["skipped_duplicate_count"] == 1
    assert skipped.json()["undo"] == {"row_id": duplicate["id"], "action": "assign"}

    undone = client.post(f"/import/sessions/{second_session}/undo")

    assert undone.status_code == 200, undone.text
    body = undone.json()
    assert body["skipped_duplicate_count"] == 0
    assert body["imported_new_count"] == 0
    restored = next(item for item in body["statements"][0]["rows"] if item["id"] == duplicate["id"])
    assert restored["status"] == ROW_STATUS_PENDING
    db_session.expire_all()
    candidate = db_session.get(ImportCandidateRowModel, UUID(duplicate["id"]))
    assert candidate is not None and candidate.dedup_skipped is False


def test_assigning_the_last_pending_row_keeps_the_pdf_and_does_not_finalize(
    client_with_fx: TestClient, db_session: Session
) -> None:
    """AC #7 inverted from pre-4.12 behavior: the last pending assign is NOT
    finalization. Review includes ImportReviewSheet until Save."""
    client = client_with_fx
    _register(client, "lastrowkeepspdf@example.com")
    user_id = UUID(client.get("/auth/me").json()["user_id"])
    list_id = _own_list_id(client)
    session_id = _upload_bac_session(client)
    for row in _pending_rows(client.get(f"/import/sessions/{session_id}").json()):
        assert _assign(client, session_id, row["id"], list_id).status_code == 200

    payload = client.get(f"/import/sessions/{session_id}").json()
    assert payload["finalized_at"] is None
    db_session.expire_all()
    statements = db_session.scalars(
        select(ImportStatementModel).where(ImportStatementModel.session_id == UUID(session_id))
    ).all()
    assert all(row.pdf_path is not None for row in statements)
    leftover = list((_pdf_storage_base() / str(user_id)).glob("*.pdf"))
    assert leftover != []


def test_finalize_with_pending_rows_is_409_and_leaves_the_pdf(
    client: TestClient, db_session: Session
) -> None:
    _register(client, "finalizepending@example.com")
    session_id = _upload_bac_session(client)
    user_id = client.get("/auth/me").json()["user_id"]

    response = client.post(f"/import/sessions/{session_id}/finalize")

    assert response.status_code == 409, response.text
    assert response.json()["code"] == "import_session_has_pending_rows"
    leftover = list((_pdf_storage_base() / user_id).glob("*.pdf"))
    assert leftover != []
    db_session.expire_all()
    statements = db_session.scalars(
        select(ImportStatementModel).where(ImportStatementModel.session_id == UUID(session_id))
    ).all()
    assert all(row.pdf_path is not None for row in statements)


def test_finalize_on_a_resolved_session_releases_the_pdf_and_is_idempotent(
    client_with_fx: TestClient, db_session: Session
) -> None:
    client = client_with_fx
    _register(client, "finalizeclean@example.com")
    user_id = client.get("/auth/me").json()["user_id"]
    list_id = _own_list_id(client)
    session_id = _upload_bac_session(client)
    for row in _pending_rows(client.get(f"/import/sessions/{session_id}").json()):
        assert _assign(client, session_id, row["id"], list_id).status_code == 200

    finalized = client.post(f"/import/sessions/{session_id}/finalize")

    assert finalized.status_code == 200, finalized.text
    assert finalized.json()["finalized_at"] is not None
    _assert_source_pdf_released(db_session, session_id=session_id, user_id=user_id)

    again = client.post(f"/import/sessions/{session_id}/finalize")
    assert again.status_code == 200, again.text
    assert again.json()["finalized_at"] == finalized.json()["finalized_at"]


def test_finalize_on_a_discarded_session_is_409(client: TestClient) -> None:
    _register(client, "finalizediscarded@example.com")
    session_id = _upload_bac_session(client)
    assert client.delete(f"/import/sessions/{session_id}").status_code == 200

    response = client.post(f"/import/sessions/{session_id}/finalize")

    assert response.status_code == 409, response.text
    assert response.json()["code"] == "import_session_discarded"


def test_finalize_retains_the_pdf_while_a_statement_failed(
    client: TestClient, db_session: Session
) -> None:
    """Incomplete/unresolved-quarantine retention is Epic 5's and reuses today's
    `session_needs_source_pdf` rule unchanged — finalize stamps, the file stays."""
    _register(client, "finalizefailed@example.com")
    user_id = UUID(client.get("/auth/me").json()["user_id"])
    repo = SqlAlchemyImportSessionRepository(db_session)
    storage = FilesystemPdfStorage(base_dir=os.environ["PDF_STORAGE_PATH"])
    path = storage.save(user_id=user_id, filename="failed.pdf", content=b"%PDF-1.4 stub")
    record = repo.create_session(
        session_id=uuid4(),
        user_id=user_id,
        statements=[
            DetectedStatement(
                product_id="fake_product",
                status=STATEMENT_STATUS_FAILED,
                candidate_rows=[],
            )
        ],
        pdf_paths={0: path},
    )
    db_session.commit()

    response = client.post(f"/import/sessions/{record.id}/finalize")

    assert response.status_code == 200, response.text
    assert response.json()["finalized_at"] is not None
    db_session.expire_all()
    statement = db_session.scalars(
        select(ImportStatementModel).where(ImportStatementModel.session_id == record.id)
    ).one()
    assert statement.pdf_path is not None
    assert Path(path).exists()


def test_bulk_commit_still_releases_the_pdf_and_now_stamps_finalized_at(
    client_with_fx: TestClient, db_session: Session
) -> None:
    """Bulk is explicitly unchanged on PDF release (AC #5) — there is no sheet in
    that flow, so bulk commit is the end of review, and AD-4 makes it a
    finalize."""
    client = client_with_fx
    _register(client, "bulkfinalizes@example.com")
    user_id = client.get("/auth/me").json()["user_id"]
    list_id = _own_list_id(client)
    session_id = _upload_bac_session(client)

    committed = client.post(f"/import/sessions/{session_id}/bulk-commit", json={"list_id": list_id})

    assert committed.status_code == 200, committed.text
    assert committed.json()["imported_new_count"] > 0
    _assert_source_pdf_released(db_session, session_id=session_id, user_id=user_id)
    assert client.get(f"/import/sessions/{session_id}").json()["finalized_at"] is not None


def test_landing_list_id_picks_the_list_that_received_the_most_rows(
    client_with_fx: TestClient, db_session: Session
) -> None:
    client = client_with_fx
    _register(client, "landinguneven@example.com")
    list_a = _own_list_id(client)
    created = client.post("/lists", json={"name": "Landing target"})
    assert created.status_code in (200, 201), created.text
    list_b = created.json()["id"]
    session_id = _upload_bac_session(client)
    rows = _pending_rows(client.get(f"/import/sessions/{session_id}").json())
    assert len(rows) >= 3

    assert _assign(client, session_id, rows[0]["id"], list_a).status_code == 200
    for row in rows[1:3]:
        assert _assign(client, session_id, row["id"], list_b).status_code == 200

    payload = client.get(f"/import/sessions/{session_id}").json()
    assert payload["landing_list_id"] == list_b
    assert payload["imported_new_count"] == 3


def test_landing_list_id_is_null_when_nothing_new_was_imported(
    client: TestClient, db_session: Session
) -> None:
    """A session that imported nothing new has no honest landing target, so the
    caller stays put rather than guessing (AC #6)."""
    _register(client, "landingnull@example.com")
    session_id = _upload_bac_session(client)
    for row in _pending_rows(client.get(f"/import/sessions/{session_id}").json()):
        deleted = client.post(f"/import/sessions/{session_id}/rows/{row['id']}/delete")
        assert deleted.status_code == 200, deleted.text

    payload = client.get(f"/import/sessions/{session_id}").json()
    assert payload["landing_list_id"] is None
    assert payload["imported_new_count"] == 0
    assert payload["skipped_duplicate_count"] == 0


# --- Story 4.13.1: assigned_rows payload + per-row unassign (ImportReviewSheet) ---


def test_get_session_assigned_rows_committed_only_pending_and_deleted_excluded(
    client_with_fx: TestClient,
) -> None:
    client = client_with_fx
    _register(client, "assignedrowsget@example.com")
    list_id = _own_list_id(client)
    session_id = _upload_bac_session(client)
    rows = _pending_rows(client.get(f"/import/sessions/{session_id}").json())
    assert len(rows) >= 3
    assigned_row, deleted_row, still_pending_row = rows[0], rows[1], rows[2]

    assert _assign(client, session_id, assigned_row["id"], list_id).status_code == 200
    deleted = client.post(f"/import/sessions/{session_id}/rows/{deleted_row['id']}/delete")
    assert deleted.status_code == 200, deleted.text

    payload = client.get(f"/import/sessions/{session_id}").json()
    statement = payload["statements"][0]
    pending_ids = {row["id"] for row in statement["rows"]}
    assigned_ids = {row["id"] for row in statement["assigned_rows"]}

    # Pending-only contract (4.11 AC #1) stays unchanged.
    assert deleted_row["id"] not in pending_ids
    assert assigned_row["id"] not in pending_ids
    assert still_pending_row["id"] in pending_ids
    # assigned_rows is committed-only; deleted rows never appear in either array.
    assert assigned_ids == {assigned_row["id"]}
    assert deleted_row["id"] not in assigned_ids

    entry = next(row for row in statement["assigned_rows"] if row["id"] == assigned_row["id"])
    assert entry["resolved_list_id"] == list_id
    assert entry["dedup_skipped"] is False
    assert entry["status"] == ROW_STATUS_COMMITTED
    assert isinstance(entry["amount"], str)
    Decimal(entry["amount"])  # money asserts use Decimal, never float


def test_unassign_returns_row_to_pending_hard_deletes_ledger_and_allows_reassign(
    client_with_fx: TestClient, db_session: Session
) -> None:
    client = client_with_fx
    _register(client, "unassignreassign@example.com")
    list_id = _own_list_id(client)
    session_id = _upload_bac_session(client)
    row = _first_pending(client, session_id)
    assert _assign(client, session_id, row["id"], list_id).status_code == 200

    unassigned = client.post(f"/import/sessions/{session_id}/rows/{row['id']}/unassign")

    assert unassigned.status_code == 200, unassigned.text
    body = unassigned.json()
    statement = body["statements"][0]
    assert any(item["id"] == row["id"] for item in statement["rows"])
    assert all(item["id"] != row["id"] for item in statement["assigned_rows"])
    assert body["undo"] is None  # sheet discard is not card-undo; the pointer must not survive it

    db_session.expire_all()
    candidate = db_session.get(ImportCandidateRowModel, UUID(row["id"]))
    assert candidate is not None
    assert candidate.status == ROW_STATUS_PENDING
    assert candidate.dedup_skipped is False
    assert (
        db_session.scalars(
            select(LedgerEntryModel).where(
                LedgerEntryModel.import_candidate_row_id == UUID(row["id"])
            )
        ).first()
        is None
    )

    # UNIQUE(import_candidate_row_id) is actually freed — re-assign succeeds.
    reassigned = _assign(client, session_id, row["id"], list_id)
    assert reassigned.status_code == 200, reassigned.text


def test_unassign_dedup_skipped_row_is_409_and_stays_committed(
    client_with_fx: TestClient, db_session: Session
) -> None:
    client = client_with_fx
    _register(client, "unassigndedup@example.com")
    list_id = _own_list_id(client)
    first_session = _upload_bac_session(client)
    first_row = _first_pending(client, first_session)
    identity = _identity_of(db_session, first_row["id"])
    assert _assign(client, first_session, first_row["id"], list_id).status_code == 200

    second_session = _upload_bac_session(client)
    duplicate = next(
        item
        for item in _pending_rows(client.get(f"/import/sessions/{second_session}").json())
        if _identity_of(db_session, item["id"]) == identity
    )
    assert _assign(client, second_session, duplicate["id"], list_id).status_code == 200
    db_session.expire_all()
    assert db_session.get(ImportCandidateRowModel, UUID(duplicate["id"])).dedup_skipped is True

    response = client.post(f"/import/sessions/{second_session}/rows/{duplicate['id']}/unassign")

    assert response.status_code == 409, response.text
    assert response.json()["code"] == "import_row_not_discardable"
    db_session.expire_all()
    candidate = db_session.get(ImportCandidateRowModel, UUID(duplicate["id"]))
    assert candidate.status == ROW_STATUS_COMMITTED
    assert candidate.dedup_skipped is True


def test_unassign_last_remaining_assigned_row_leaves_assigned_rows_empty(
    client_with_fx: TestClient, db_session: Session
) -> None:
    client = client_with_fx
    _register(client, "unassignlastrow@example.com")
    user_id = UUID(client.get("/auth/me").json()["user_id"])
    list_id = _own_list_id(client)
    repo = SqlAlchemyImportSessionRepository(db_session)
    record = repo.create_session(
        session_id=uuid4(),
        user_id=user_id,
        statements=[
            DetectedStatement(
                product_id="fake_product",
                status=STATEMENT_STATUS_STAGED,
                candidate_rows=[_crc_line("only")],
            )
        ],
        pdf_paths={0: "/data/pdfs/unassign-last-row.pdf"},
    )
    db_session.commit()
    row_id = record.statements[0].candidate_rows[0].id
    assert _assign(client, record.id, row_id, list_id).status_code == 200

    unassigned = client.post(f"/import/sessions/{record.id}/rows/{row_id}/unassign")

    assert unassigned.status_code == 200, unassigned.text
    body = unassigned.json()
    statement = body["statements"][0]
    assert statement["status"] == STATEMENT_STATUS_STAGED
    assert [row["id"] for row in statement["rows"]] == [str(row_id)]
    assert statement["assigned_rows"] == []


def test_unassign_unknown_row_id_is_404(client_with_fx: TestClient) -> None:
    client = client_with_fx
    _register(client, "unassignunknown@example.com")
    session_id = _upload_bac_session(client)

    response = client.post(f"/import/sessions/{session_id}/rows/{uuid4()}/unassign")

    assert response.status_code == 404, response.text
    assert response.json()["code"] == "import_row_not_found"


def test_unassign_a_still_pending_row_is_409(client_with_fx: TestClient) -> None:
    client = client_with_fx
    _register(client, "unassignpending@example.com")
    session_id = _upload_bac_session(client)
    row = _first_pending(client, session_id)

    response = client.post(f"/import/sessions/{session_id}/rows/{row['id']}/unassign")

    assert response.status_code == 409, response.text
    assert response.json()["code"] == "import_row_not_available"


def test_finalize_after_unassign_reopens_pending_is_409(client_with_fx: TestClient) -> None:
    """Unassign puts a row back in the review queue — finalize (Save) must
    still refuse while it sits pending again."""
    client = client_with_fx
    _register(client, "finalizeafterunassign@example.com")
    list_id = _own_list_id(client)
    session_id = _upload_bac_session(client)
    rows = _pending_rows(client.get(f"/import/sessions/{session_id}").json())
    for row in rows:
        assert _assign(client, session_id, row["id"], list_id).status_code == 200

    assert (
        client.post(f"/import/sessions/{session_id}/rows/{rows[0]['id']}/unassign").status_code
        == 200
    )

    response = client.post(f"/import/sessions/{session_id}/finalize")

    assert response.status_code == 409, response.text
    assert response.json()["code"] == "import_session_has_pending_rows"


def test_delete_assigned_row_reverses_ledger_leaves_no_pending_and_finalizes(
    client_with_fx: TestClient, db_session: Session
) -> None:
    """ImportReviewSheet Save: POST .../delete on a committed row must not
    409, must not return it to pending, must drop its ledger expense, and
    remaining assigned rows must then finalize."""
    client = client_with_fx
    _register(client, "deleteassignedfinalize@example.com")
    list_id = _own_list_id(client)
    session_id = _upload_bac_session(client)
    rows = _pending_rows(client.get(f"/import/sessions/{session_id}").json())
    assert len(rows) >= 2
    keep, discard = rows[0], rows[1]
    for row in rows:
        assert _assign(client, session_id, row["id"], list_id).status_code == 200

    deleted = client.post(f"/import/sessions/{session_id}/rows/{discard['id']}/delete")

    assert deleted.status_code == 200, deleted.text
    body = deleted.json()
    statement = body["statements"][0]
    pending_ids = {row["id"] for row in statement["rows"]}
    assigned_ids = {row["id"] for row in statement["assigned_rows"]}
    assert discard["id"] not in pending_ids
    assert discard["id"] not in assigned_ids
    assert keep["id"] in assigned_ids
    assert pending_ids == set()
    assert body["undo"] is None

    db_session.expire_all()
    candidate = db_session.get(ImportCandidateRowModel, UUID(discard["id"]))
    assert candidate is not None
    assert candidate.status == ROW_STATUS_DELETED
    assert candidate.resolved_list_id is None
    assert (
        db_session.scalars(
            select(LedgerEntryModel).where(
                LedgerEntryModel.import_candidate_row_id == UUID(discard["id"])
            )
        ).first()
        is None
    )
    assert (
        db_session.scalars(
            select(LedgerEntryModel).where(
                LedgerEntryModel.import_candidate_row_id == UUID(keep["id"])
            )
        ).first()
        is not None
    )

    finalized = client.post(f"/import/sessions/{session_id}/finalize")
    assert finalized.status_code == 200, finalized.text
    assert finalized.json()["finalized_at"] is not None
