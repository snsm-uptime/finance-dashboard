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
from application.fx_service import MaterializedFx
from application.import_session import (
    AssignBulkImportCommand,
    AssignBulkImportService,
    AssignIndividualImportCommand,
    AssignIndividualImportService,
    DetectedStatement,
    DiscardImportSessionCommand,
    DiscardImportSessionService,
    ImportBatchRecord,
    ImportSessionRecord,
    SkipStatementCommand,
    SkipStatementService,
    StagedStatementRecord,
    UploadStatementPdfCommand,
    UploadStatementPdfService,
    run_import_pipeline,
)
from domain.canonical_line import CanonicalLine
from domain.errors import (
    AmbiguousBankAdapterError,
    ImportSessionAlreadyCommittedError,
    ImportSessionDiscardedError,
    ImportSessionNotFoundError,
    ImportStatementNotAvailableError,
    ImportStatementNotFoundError,
    InvalidCanonicalLineError,
    NoCleanStatementsToCommitError,
    NotListMemberError,
    UnknownBankAdapterError,
    UnsupportedFileTypeError,
)
from domain.import_session import (
    STATEMENT_STATUS_COMMITTED,
    STATEMENT_STATUS_FAILED,
    STATEMENT_STATUS_SKIPPED,
    STATEMENT_STATUS_STAGED,
)

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
    commit_calls: list[dict] = field(default_factory=list)

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
                candidate_rows=s.candidate_rows,
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

    def commit_statement_batch(
        self,
        *,
        batch_id: UUID,
        session_id: UUID,
        statement_id: UUID,
        list_id: UUID,
        actor_user_id: UUID,
        rows: list,
    ) -> ImportBatchRecord:
        self.commit_calls.append(
            {
                "batch_id": batch_id,
                "session_id": session_id,
                "statement_id": statement_id,
                "list_id": list_id,
                "actor_user_id": actor_user_id,
                "rows": rows,
            }
        )
        record = self.sessions[session_id]
        updated_statements = [
            StagedStatementRecord(
                id=s.id,
                session_id=s.session_id,
                product_id=s.product_id,
                status=STATEMENT_STATUS_COMMITTED if s.id == statement_id else s.status,
                candidate_row_count=s.candidate_row_count,
                pdf_path=s.pdf_path,
                candidate_rows=s.candidate_rows,
            )
            for s in record.statements
        ]
        self.sessions[session_id] = ImportSessionRecord(
            id=record.id,
            user_id=record.user_id,
            created_at=record.created_at,
            discarded_at=record.discarded_at,
            statements=updated_statements,
        )
        ledger_entry_ids = [uuid4() for _ in rows]
        return ImportBatchRecord(
            id=batch_id,
            session_id=session_id,
            statement_id=statement_id,
            list_id=list_id,
            actor_user_id=actor_user_id,
            created_at=datetime.now(UTC),
            ledger_entry_ids=ledger_entry_ids,
        )

    def skip_statement(
        self, *, session_id: UUID, statement_id: UUID, user_id: UUID
    ) -> ImportSessionRecord:
        record = self.sessions[session_id]
        if record.user_id != user_id:
            raise ImportSessionNotFoundError()
        if not any(s.id == statement_id for s in record.statements):
            raise ImportStatementNotFoundError()
        updated_statements = [
            StagedStatementRecord(
                id=s.id,
                session_id=s.session_id,
                product_id=s.product_id,
                status=STATEMENT_STATUS_SKIPPED if s.id == statement_id else s.status,
                candidate_row_count=s.candidate_row_count,
                pdf_path=s.pdf_path,
                candidate_rows=s.candidate_rows,
            )
            for s in record.statements
        ]
        updated = ImportSessionRecord(
            id=record.id,
            user_id=record.user_id,
            created_at=record.created_at,
            discarded_at=record.discarded_at,
            statements=updated_statements,
        )
        self.sessions[session_id] = updated
        return updated

    def clear_statement_pdf_paths(self, session_id: UUID, user_id: UUID) -> None:
        record = self.sessions.get(session_id)
        if record is None or record.user_id != user_id:
            return
        updated_statements = [
            StagedStatementRecord(
                id=s.id,
                session_id=s.session_id,
                product_id=s.product_id,
                status=s.status,
                candidate_row_count=s.candidate_row_count,
                pdf_path=None,
                candidate_rows=s.candidate_rows,
            )
            for s in record.statements
        ]
        self.sessions[session_id] = ImportSessionRecord(
            id=record.id,
            user_id=record.user_id,
            created_at=record.created_at,
            discarded_at=record.discarded_at,
            statements=updated_statements,
        )


@dataclass
class _FakeListPeek:
    id: UUID
    owner_id: UUID


@dataclass
class _FakeMembershipPeek:
    user_id: UUID
    role: str = "member"


@dataclass
class _FakeListLookup:
    """Minimal ListAccessLookup double — mirrors test_cards_application.py's fake."""

    lists: dict[UUID, _FakeListPeek] = field(default_factory=dict)
    memberships: dict[UUID, list[_FakeMembershipPeek]] = field(default_factory=dict)

    def add_member(self, list_id: UUID, owner_id: UUID, user_id: UUID) -> None:
        self.lists.setdefault(list_id, _FakeListPeek(id=list_id, owner_id=owner_id))
        self.memberships.setdefault(list_id, []).append(_FakeMembershipPeek(user_id=user_id))

    def get_list(self, list_id: UUID) -> _FakeListPeek | None:
        return self.lists.get(list_id)

    def get_membership(self, list_id: UUID, user_id: UUID) -> _FakeMembershipPeek | None:
        for m in self.memberships.get(list_id, []):
            if m.user_id == user_id:
                return m
        return None


class _FakeFxService:
    """No-op FX — CRC-through-1:1 matches real MaterializeFxService for CRC rows."""

    def materialize_fx_for_entry(
        self, *, amount: Decimal, currency: str, posted_date
    ) -> MaterializedFx:
        return MaterializedFx(
            amount_crc=amount, fx_rate=Decimal("1"), fx_rate_date=posted_date, fx_fallback=False
        )


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


# --- Story 4.7 Task 2.4: AssignBulkImportService -----------------------------------


def _multi_statement_session(
    repo: _FakeImportSessionRepo,
    storage: _FakePdfStorage,
    *,
    user_id: UUID,
    parse_results: list[list[CanonicalLine] | Exception],
) -> UUID:
    adapter = FakeAdapter(
        split_chunks=[f"c{i}".encode() for i in range(len(parse_results))],
        parse_results=parse_results,
    )
    service = UploadStatementPdfService(storage, [adapter], repo)
    session = service.execute(
        UploadStatementPdfCommand(
            actor_user_id=user_id, filename="statement.pdf", content=PDF_BYTES
        )
    )
    return session.id


def test_bulk_assign_two_clean_statements_creates_two_batches_payer_is_actor() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[[_row("r1")], [_row("r2")]]
    )

    result = AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
        AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
    )

    assert len(result.batches) == 2
    assert all(b.list_id == list_id for b in result.batches)
    assert len(repo.commit_calls) == 2
    for call in repo.commit_calls:
        assert call["actor_user_id"] == actor
        draft, fx = call["rows"][0]
        assert draft.payer_id == actor
        assert draft.provenance == "parser"
    updated = repo.get_session(session_id, actor)
    assert all(s.status == STATEMENT_STATUS_COMMITTED for s in updated.statements)
    assert storage.deleted == [f"/data/pdfs/{storage.saved[0][0]}/0.pdf"]
    assert all(s.pdf_path is None for s in updated.statements)


def test_bulk_assign_excludes_failed_statement_from_commit() -> None:
    """AC #4: a failed-parse statement is deferred to Epic 5, not silently committed."""
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(
        repo,
        storage,
        user_id=actor,
        parse_results=[[_row("r1")], InvalidCanonicalLineError("bad")],
    )

    result = AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
        AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
    )

    assert len(result.batches) == 1
    updated = repo.get_session(session_id, actor)
    statuses = {s.status for s in updated.statements}
    assert statuses == {STATEMENT_STATUS_COMMITTED, STATEMENT_STATUS_FAILED}
    assert storage.deleted == []
    assert all(s.pdf_path is not None for s in updated.statements)


def test_bulk_assign_nonexistent_session_not_found() -> None:
    repo = _FakeImportSessionRepo()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)

    with pytest.raises(ImportSessionNotFoundError):
        AssignBulkImportService(repo, lookup, _FakeFxService(), _FakePdfStorage()).execute(
            AssignBulkImportCommand(actor_user_id=actor, session_id=uuid4(), list_id=list_id)
        )


def test_bulk_assign_non_member_list_denied_no_commit() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    stranger_list_owner = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=stranger_list_owner, user_id=stranger_list_owner)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])

    with pytest.raises(NotListMemberError):
        AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
            AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
        )
    assert repo.commit_calls == []


def test_bulk_assign_discarded_session_rejected() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    DiscardImportSessionService(repo, storage).execute(
        DiscardImportSessionCommand(actor_user_id=actor, session_id=session_id)
    )

    with pytest.raises(ImportSessionDiscardedError):
        AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
            AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
        )
    assert repo.commit_calls == []


def test_bulk_assign_all_failed_statements_rejected() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[InvalidCanonicalLineError("bad")]
    )

    with pytest.raises(NoCleanStatementsToCommitError):
        AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
            AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
        )
    assert repo.commit_calls == []


def test_bulk_assign_already_committed_session_rejected_no_double_commit() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    service = AssignBulkImportService(repo, lookup, _FakeFxService(), storage)
    command = AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
    service.execute(command)
    assert len(repo.commit_calls) == 1

    with pytest.raises(ImportSessionAlreadyCommittedError):
        service.execute(command)
    assert len(repo.commit_calls) == 1


def test_bulk_assign_rejects_candidate_row_with_invalid_amount_no_commit() -> None:
    """Story 4.7 review finding: a malformed row (more than 2 decimal places
    here) must fail loud via validate_bulk_candidate_row, not silently land
    in ledger_entries — mirrors validate_manual_expense's invariants for
    hand expenses on the same table."""
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    bad_row = CanonicalLine(
        posted_date="2026-01-01",
        amount=Decimal("10.005"),
        currency="CRC",
        product_id="fake_product",
        line_type="purchase",
        normalized_description="fractional cents",
    )
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[bad_row]])

    with pytest.raises(InvalidCanonicalLineError):
        AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
            AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
        )
    assert len(repo.commit_calls) == 0


# --- Story 4.8 Task 2.5: AssignIndividualImportService / SkipStatementService -----


def test_individual_accept_commits_only_targeted_statement() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[[_row("r1")], [_row("r2")]]
    )
    session = repo.get_session(session_id, actor)
    target = session.statements[0]

    result = AssignIndividualImportService(repo, lookup, _FakeFxService(), storage).execute(
        AssignIndividualImportCommand(
            actor_user_id=actor, session_id=session_id, statement_id=target.id, list_id=list_id
        )
    )

    assert result.statement_id == target.id
    assert result.list_id == list_id
    assert len(repo.commit_calls) == 1
    updated = repo.get_session(session_id, actor)
    statuses = {s.id: s.status for s in updated.statements}
    assert statuses[target.id] == STATEMENT_STATUS_COMMITTED
    other = next(s for s in session.statements if s.id != target.id)
    assert statuses[other.id] == STATEMENT_STATUS_STAGED
    assert storage.deleted == []
    assert all(s.pdf_path is not None for s in updated.statements)


def test_individual_accept_on_failed_statement_rejected() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[InvalidCanonicalLineError("bad")]
    )
    session = repo.get_session(session_id, actor)
    target = session.statements[0]

    with pytest.raises(ImportStatementNotAvailableError):
        AssignIndividualImportService(repo, lookup, _FakeFxService(), storage).execute(
            AssignIndividualImportCommand(
                actor_user_id=actor, session_id=session_id, statement_id=target.id, list_id=list_id
            )
        )
    assert repo.commit_calls == []


def test_individual_accept_already_committed_statement_rejected_no_double_commit() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    session = repo.get_session(session_id, actor)
    target = session.statements[0]
    service = AssignIndividualImportService(repo, lookup, _FakeFxService(), storage)
    command = AssignIndividualImportCommand(
        actor_user_id=actor, session_id=session_id, statement_id=target.id, list_id=list_id
    )
    service.execute(command)
    assert len(repo.commit_calls) == 1

    with pytest.raises(ImportStatementNotAvailableError):
        service.execute(command)
    assert len(repo.commit_calls) == 1


def test_individual_accept_discarded_session_rejected() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    session = repo.get_session(session_id, actor)
    target = session.statements[0]
    DiscardImportSessionService(repo, storage).execute(
        DiscardImportSessionCommand(actor_user_id=actor, session_id=session_id)
    )

    with pytest.raises(ImportSessionDiscardedError):
        AssignIndividualImportService(repo, lookup, _FakeFxService(), storage).execute(
            AssignIndividualImportCommand(
                actor_user_id=actor, session_id=session_id, statement_id=target.id, list_id=list_id
            )
        )
    assert repo.commit_calls == []


def test_individual_accept_unknown_statement_id_not_found() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])

    with pytest.raises(ImportStatementNotFoundError):
        AssignIndividualImportService(repo, lookup, _FakeFxService(), storage).execute(
            AssignIndividualImportCommand(
                actor_user_id=actor, session_id=session_id, statement_id=uuid4(), list_id=list_id
            )
        )
    assert repo.commit_calls == []


def test_individual_accept_non_member_list_denied_no_commit() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    stranger_list_owner = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=stranger_list_owner, user_id=stranger_list_owner)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    session = repo.get_session(session_id, actor)
    target = session.statements[0]

    with pytest.raises(NotListMemberError):
        AssignIndividualImportService(repo, lookup, _FakeFxService(), storage).execute(
            AssignIndividualImportCommand(
                actor_user_id=actor, session_id=session_id, statement_id=target.id, list_id=list_id
            )
        )
    assert repo.commit_calls == []


def test_individual_accept_rejects_statement_with_one_invalid_row_no_partial_commit() -> None:
    """Individual shares validate_bulk_candidate_row with Bulk (Story 4.7's
    equivalent guard: test_bulk_assign_rejects_candidate_row_with_invalid_amount_no_commit)
    but had no test of its own confirming the same all-or-nothing behavior
    when a targeted statement mixes valid and invalid rows (Story 4.8 review
    finding)."""
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    bad_row = CanonicalLine(
        posted_date="2026-01-01",
        amount=Decimal("10.005"),
        currency="CRC",
        product_id="fake_product",
        line_type="purchase",
        normalized_description="fractional cents",
    )
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[[_row("good"), bad_row]]
    )
    session = repo.get_session(session_id, actor)
    target = session.statements[0]

    with pytest.raises(InvalidCanonicalLineError):
        AssignIndividualImportService(repo, lookup, _FakeFxService(), storage).execute(
            AssignIndividualImportCommand(
                actor_user_id=actor, session_id=session_id, statement_id=target.id, list_id=list_id
            )
        )
    assert repo.commit_calls == []


def test_skip_staged_statement_flips_status_no_ledger_call() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    actor = uuid4()
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    session = repo.get_session(session_id, actor)
    target = session.statements[0]

    result = SkipStatementService(repo, storage).execute(
        SkipStatementCommand(actor_user_id=actor, session_id=session_id, statement_id=target.id)
    )

    assert result.statements[0].status == STATEMENT_STATUS_SKIPPED
    assert repo.commit_calls == []
    released = repo.get_session(session_id, actor)
    assert storage.deleted == [f"/data/pdfs/{storage.saved[0][0]}/0.pdf"]
    assert all(s.pdf_path is None for s in released.statements)


def test_skip_failed_statement_allowed() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    actor = uuid4()
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[InvalidCanonicalLineError("bad")]
    )
    session = repo.get_session(session_id, actor)
    target = session.statements[0]

    result = SkipStatementService(repo, storage).execute(
        SkipStatementCommand(actor_user_id=actor, session_id=session_id, statement_id=target.id)
    )

    assert result.statements[0].status == STATEMENT_STATUS_SKIPPED
    released = repo.get_session(session_id, actor)
    assert storage.deleted == [f"/data/pdfs/{storage.saved[0][0]}/0.pdf"]
    assert all(s.pdf_path is None for s in released.statements)


def test_skip_already_committed_statement_rejected() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    session = repo.get_session(session_id, actor)
    target = session.statements[0]
    AssignIndividualImportService(repo, lookup, _FakeFxService(), storage).execute(
        AssignIndividualImportCommand(
            actor_user_id=actor, session_id=session_id, statement_id=target.id, list_id=list_id
        )
    )

    with pytest.raises(ImportStatementNotAvailableError):
        SkipStatementService(repo, storage).execute(
            SkipStatementCommand(actor_user_id=actor, session_id=session_id, statement_id=target.id)
        )


def test_skip_already_skipped_statement_rejected() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    actor = uuid4()
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    session = repo.get_session(session_id, actor)
    target = session.statements[0]
    service = SkipStatementService(repo, storage)
    command = SkipStatementCommand(
        actor_user_id=actor, session_id=session_id, statement_id=target.id
    )
    service.execute(command)

    with pytest.raises(ImportStatementNotAvailableError):
        service.execute(command)


def test_individual_accept_releases_source_pdf_after_last_statement() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[[_row("r1")], [_row("r2")]]
    )
    session = repo.get_session(session_id, actor)
    first, second = session.statements
    service = AssignIndividualImportService(repo, lookup, _FakeFxService(), storage)

    service.execute(
        AssignIndividualImportCommand(
            actor_user_id=actor, session_id=session_id, statement_id=first.id, list_id=list_id
        )
    )
    after_first = repo.get_session(session_id, actor)
    assert storage.deleted == []
    assert all(s.pdf_path is not None for s in after_first.statements)

    service.execute(
        AssignIndividualImportCommand(
            actor_user_id=actor, session_id=session_id, statement_id=second.id, list_id=list_id
        )
    )
    after_last = repo.get_session(session_id, actor)
    assert storage.deleted == [f"/data/pdfs/{storage.saved[0][0]}/0.pdf"]
    assert all(s.pdf_path is None for s in after_last.statements)


def test_skip_one_of_two_staged_keeps_source_pdf() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    actor = uuid4()
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[[_row("r1")], [_row("r2")]]
    )
    session = repo.get_session(session_id, actor)
    target = session.statements[0]

    SkipStatementService(repo, storage).execute(
        SkipStatementCommand(actor_user_id=actor, session_id=session_id, statement_id=target.id)
    )

    remaining = repo.get_session(session_id, actor)
    assert storage.deleted == []
    assert all(s.pdf_path is not None for s in remaining.statements)


def test_staged_statement_record_has_no_unchecked_card_routing_field() -> None:
    """Canary (Story 4.7 code review): AC #1 assumes Bulk only ever sees
    review-routed cards, but no card/routing_mode linkage exists on a
    statement today (that's Stories 4.4/4.6's territory) — so
    AssignBulkImportService.execute has no gate to enforce it and none is
    needed yet.

    If a future story adds `card_id` / `routing_mode` to
    `StagedStatementRecord` or `DetectedStatement` without also adding an
    explicit routing_mode check in AssignBulkImportService.execute, this
    test fails loud instead of the gap silently persisting.
    """
    from dataclasses import fields

    staged_names = {f.name for f in fields(StagedStatementRecord)}
    detected_names = {f.name for f in fields(DetectedStatement)}
    leaked = (staged_names | detected_names) & {"card_id", "routing_mode"}
    assert not leaked, (
        f"{leaked} landed on a statement record without a routing_mode gate in "
        "AssignBulkImportService.execute (Story 4.7 review finding) — add the "
        "AC #1 review-routing check before removing this canary."
    )
