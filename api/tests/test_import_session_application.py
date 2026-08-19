"""Application tests for run_import_pipeline + Upload/Discard services (Story 4.6).

Fake adapters/repos/storage only (no pdfplumber, no DB) — mirrors
test_bank_adapters_application.py's FakeAdapter style and
test_cards_application.py's _FakeCardRepo style.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from application.import_session import (
    DetectedStatement,
    DiscardImportSessionCommand,
    DiscardImportSessionService,
    ImportSessionRecord,
    StagedStatementRecord,
    UploadStatementPdfCommand,
    UploadStatementPdfService,
    run_import_pipeline,
)
from domain.canonical_line import CanonicalLine
from domain.errors import (
    AmbiguousBankAdapterError,
    ImportSessionNotFoundError,
    InvalidCanonicalLineError,
    UnknownBankAdapterError,
    UnsupportedFileTypeError,
)
from domain.import_session import STATEMENT_STATUS_FAILED, STATEMENT_STATUS_STAGED

PDF_BYTES = b"%PDF-1.4\nfake statement bytes"


def _row(desc: str = "row") -> CanonicalLine:
    return CanonicalLine(
        posted_date="2026-01-01",
        amount=Decimal("10.00"),
        currency="CRC",
        product_id="fake_product",
        line_type="purchase",
        normalized_description=desc,
    )


class FakeAdapter:
    """Configurable fake BankAdapter — detect/split/parse are all stubbable."""

    def __init__(
        self,
        bank_id: str = "fake",
        *,
        matches: bool = True,
        split_chunks: list[bytes] | None = None,
        parse_results: list[list[CanonicalLine] | Exception] | None = None,
    ) -> None:
        self.bank_id = bank_id
        self.product_id = f"{bank_id}_product"
        self.account_kind = "credit"
        self._matches = matches
        self._split_chunks = split_chunks if split_chunks is not None else [PDF_BYTES]
        self._parse_results = parse_results if parse_results is not None else [[_row()]]
        self._parse_call_index = 0

    def detect(self, *, filename: str, content_sample: bytes) -> bool:
        return self._matches

    def split(self, pdf_bytes: bytes) -> list[bytes]:
        return self._split_chunks

    def parse(self, statement_bytes: bytes) -> list[CanonicalLine]:
        result = self._parse_results[self._parse_call_index]
        self._parse_call_index += 1
        if isinstance(result, Exception):
            raise result
        return result


# --- Task 2.5: run_import_pipeline -----------------------------------------------


def test_run_import_pipeline_no_adapter_detects_raises_unknown() -> None:
    with pytest.raises(UnknownBankAdapterError):
        run_import_pipeline(PDF_BYTES, filename="statement.pdf", adapters=[])


def test_run_import_pipeline_two_adapters_detect_raises_ambiguous() -> None:
    a = FakeAdapter("a", matches=True)
    b = FakeAdapter("b", matches=True)
    with pytest.raises(AmbiguousBankAdapterError):
        run_import_pipeline(PDF_BYTES, filename="statement.pdf", adapters=[a, b])


def test_run_import_pipeline_all_chunks_parse_successfully() -> None:
    adapter = FakeAdapter(
        split_chunks=[b"chunk1", b"chunk2"],
        parse_results=[[_row("r1")], [_row("r2")]],
    )
    result = run_import_pipeline(PDF_BYTES, filename="statement.pdf", adapters=[adapter])

    assert len(result) == 2
    assert all(s.status == STATEMENT_STATUS_STAGED for s in result)
    assert result[0].candidate_rows[0].normalized_description == "r1"
    assert result[1].candidate_rows[0].normalized_description == "r2"


def test_run_import_pipeline_one_chunk_fails_parse_sibling_survives() -> None:
    """AC #3: a mid-file per-chunk parse failure doesn't discard its siblings."""
    adapter = FakeAdapter(
        split_chunks=[b"chunk1", b"chunk2"],
        parse_results=[[_row("r1")], InvalidCanonicalLineError("bad row")],
    )
    result = run_import_pipeline(PDF_BYTES, filename="statement.pdf", adapters=[adapter])

    assert len(result) == 2
    assert result[0].status == STATEMENT_STATUS_STAGED
    assert result[0].candidate_rows[0].normalized_description == "r1"
    assert result[1].status == STATEMENT_STATUS_FAILED
    assert result[1].candidate_rows == []


def test_run_import_pipeline_whole_file_split_failure_propagates() -> None:
    class SplitFailsAdapter(FakeAdapter):
        def split(self, pdf_bytes: bytes) -> list[bytes]:
            raise InvalidCanonicalLineError("cannot split")

    with pytest.raises(InvalidCanonicalLineError):
        run_import_pipeline(PDF_BYTES, filename="statement.pdf", adapters=[SplitFailsAdapter()])


# --- Task 4.3: UploadStatementPdfService ------------------------------------------


@dataclass
class _FakePdfStorage:
    saved: list[tuple[UUID, str, bytes]] = field(default_factory=list)
    deleted: list[str] = field(default_factory=list)
    _next_path_index: int = 0

    def save(self, *, user_id: UUID, filename: str, content: bytes) -> str:
        self.saved.append((user_id, filename, content))
        path = f"/data/pdfs/{user_id}/{self._next_path_index}.pdf"
        self._next_path_index += 1
        return path

    def delete(self, path: str) -> None:
        self.deleted.append(path)


@dataclass
class _FakeImportSessionRepo:
    sessions: dict[UUID, ImportSessionRecord] = field(default_factory=dict)
    create_calls: list[dict] = field(default_factory=list)

    def create_session(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        statements: list[DetectedStatement],
        pdf_paths: dict[int, str],
    ) -> ImportSessionRecord:
        self.create_calls.append(
            {
                "session_id": session_id,
                "user_id": user_id,
                "statements": statements,
                "pdf_paths": pdf_paths,
            }
        )
        staged = [
            StagedStatementRecord(
                id=uuid4(),
                session_id=session_id,
                product_id=s.product_id,
                status=s.status,
                candidate_row_count=len(s.candidate_rows),
                pdf_path=pdf_paths[index],
            )
            for index, s in enumerate(statements)
        ]
        record = ImportSessionRecord(
            id=session_id,
            user_id=user_id,
            created_at=datetime.now(UTC),
            discarded_at=None,
            statements=staged,
        )
        self.sessions[session_id] = record
        return record

    def get_session(self, session_id: UUID, user_id: UUID) -> ImportSessionRecord | None:
        record = self.sessions.get(session_id)
        if record is None or record.user_id != user_id:
            return None
        return record

    def discard_session(self, session_id: UUID, user_id: UUID) -> ImportSessionRecord:
        record = self.sessions[session_id]
        updated = ImportSessionRecord(
            id=record.id,
            user_id=record.user_id,
            created_at=record.created_at,
            discarded_at=datetime.now(UTC),
            statements=record.statements,
        )
        self.sessions[session_id] = updated
        return updated


def test_upload_non_pdf_rejected_before_storage() -> None:
    storage = _FakePdfStorage()
    repo = _FakeImportSessionRepo()
    service = UploadStatementPdfService(storage, [FakeAdapter()], repo)

    with pytest.raises(UnsupportedFileTypeError):
        service.execute(
            UploadStatementPdfCommand(
                actor_user_id=uuid4(), filename="statement.pdf", content=b"not a pdf"
            )
        )
    assert storage.saved == []


def test_upload_no_adapter_matches_deletes_saved_file_and_propagates() -> None:
    storage = _FakePdfStorage()
    repo = _FakeImportSessionRepo()
    service = UploadStatementPdfService(storage, [], repo)

    with pytest.raises(UnknownBankAdapterError):
        service.execute(
            UploadStatementPdfCommand(
                actor_user_id=uuid4(), filename="statement.pdf", content=PDF_BYTES
            )
        )
    assert len(storage.saved) == 1
    assert storage.deleted == [f"/data/pdfs/{storage.saved[0][0]}/0.pdf"]
    assert repo.create_calls == []


def test_upload_two_staged_chunks_creates_session_with_both() -> None:
    adapter = FakeAdapter(split_chunks=[b"c1", b"c2"], parse_results=[[_row("r1")], [_row("r2")]])
    storage = _FakePdfStorage()
    repo = _FakeImportSessionRepo()
    service = UploadStatementPdfService(storage, [adapter], repo)

    session = service.execute(
        UploadStatementPdfCommand(
            actor_user_id=uuid4(), filename="statement.pdf", content=PDF_BYTES
        )
    )

    assert len(session.statements) == 2
    assert all(s.status == STATEMENT_STATUS_STAGED for s in session.statements)
    assert storage.deleted == []


def test_upload_mixed_staged_and_failed_persist_in_same_session() -> None:
    adapter = FakeAdapter(
        split_chunks=[b"c1", b"c2"],
        parse_results=[[_row("r1")], InvalidCanonicalLineError("bad")],
    )
    storage = _FakePdfStorage()
    repo = _FakeImportSessionRepo()
    service = UploadStatementPdfService(storage, [adapter], repo)

    session = service.execute(
        UploadStatementPdfCommand(
            actor_user_id=uuid4(), filename="statement.pdf", content=PDF_BYTES
        )
    )

    assert len(session.statements) == 2
    assert session.statements[0].status == STATEMENT_STATUS_STAGED
    assert session.statements[0].candidate_row_count == 1
    assert session.statements[1].status == STATEMENT_STATUS_FAILED
    assert session.statements[1].candidate_row_count == 0
    assert storage.deleted == []


# --- Task 5.2: DiscardImportSessionService ----------------------------------------


def _upload_session(
    repo: _FakeImportSessionRepo, storage: _FakePdfStorage, *, user_id: UUID
) -> UUID:
    adapter = FakeAdapter()
    service = UploadStatementPdfService(storage, [adapter], repo)
    session = service.execute(
        UploadStatementPdfCommand(
            actor_user_id=user_id, filename="statement.pdf", content=PDF_BYTES
        )
    )
    return session.id


def test_discard_another_users_session_not_found() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    owner = uuid4()
    stranger = uuid4()
    session_id = _upload_session(repo, storage, user_id=owner)

    with pytest.raises(ImportSessionNotFoundError):
        DiscardImportSessionService(repo, storage).execute(
            DiscardImportSessionCommand(actor_user_id=stranger, session_id=session_id)
        )


def test_discard_own_session_sets_discarded_at_and_deletes_pdf() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    owner = uuid4()
    session_id = _upload_session(repo, storage, user_id=owner)
    storage.deleted.clear()

    result = DiscardImportSessionService(repo, storage).execute(
        DiscardImportSessionCommand(actor_user_id=owner, session_id=session_id)
    )

    assert result.discarded_at is not None
    assert len(storage.deleted) == 1


def test_discard_already_discarded_session_does_not_raise() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    owner = uuid4()
    session_id = _upload_session(repo, storage, user_id=owner)
    service = DiscardImportSessionService(repo, storage)

    command = DiscardImportSessionCommand(actor_user_id=owner, session_id=session_id)
    service.execute(command)
    result = service.execute(command)

    assert result.discarded_at is not None
