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
    AssignCandidateRowCommand,
    AssignCandidateRowService,
    CandidateRowRecord,
    CommitRow,
    DeleteCandidateRowCommand,
    DeleteCandidateRowService,
    DetectedStatement,
    DiscardImportSessionCommand,
    DiscardImportSessionService,
    EditCandidateRowCommand,
    EditCandidateRowService,
    ImportBatchRecord,
    ImportSessionRecord,
    StagedStatementRecord,
    UndoLastResolutionCommand,
    UndoLastResolutionService,
    UploadStatementPdfCommand,
    UploadStatementPdfService,
    run_import_pipeline,
)
from domain.canonical_line import CanonicalLine
from domain.errors import (
    AmbiguousBankAdapterError,
    ImportRowNotAvailableError,
    ImportRowNotFoundError,
    ImportSessionDiscardedError,
    ImportSessionNotFoundError,
    ImportStatementNotFoundError,
    InvalidCanonicalLineError,
    NoCleanStatementsToCommitError,
    NotListMemberError,
    UnknownBankAdapterError,
    UnsupportedFileTypeError,
)
from domain.expenses import ORIGIN_KIND_CARD
from domain.import_session import (
    ROW_STATUS_COMMITTED,
    ROW_STATUS_DELETED,
    ROW_STATUS_EXCLUDED_ZERO_AMOUNT,
    ROW_STATUS_PENDING,
    STATEMENT_STATUS_COMMITTED,
    STATEMENT_STATUS_FAILED,
    STATEMENT_STATUS_STAGED,
    row_is_zero_amount,
    statement_is_fully_resolved,
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


def _candidate_records(lines: list[CanonicalLine]) -> list[CandidateRowRecord]:
    return [
        CandidateRowRecord(
            id=uuid4(),
            sequence=index,
            status=(
                ROW_STATUS_EXCLUDED_ZERO_AMOUNT
                if row_is_zero_amount(line.amount)
                else ROW_STATUS_PENDING
            ),
            resolved_list_id=None,
            line=line,
        )
        for index, line in enumerate(lines)
    ]


def _copy_statement(
    statement: StagedStatementRecord,
    *,
    status: str | None = None,
    pdf_path: str | None | object = ...,
    card_id: UUID | None | object = ...,
    candidate_rows: list[CandidateRowRecord] | None = None,
) -> StagedStatementRecord:
    rows = statement.candidate_rows if candidate_rows is None else candidate_rows
    return StagedStatementRecord(
        id=statement.id,
        session_id=statement.session_id,
        product_id=statement.product_id,
        status=statement.status if status is None else status,
        candidate_row_count=len(rows),
        pdf_path=statement.pdf_path if pdf_path is ... else pdf_path,  # type: ignore[arg-type]
        iban=statement.iban,
        card_id=statement.card_id if card_id is ... else card_id,  # type: ignore[arg-type]
        original_filename=statement.original_filename,
        candidate_rows=rows,
    )


@dataclass
class _FakeImportSessionRepo:
    sessions: dict[UUID, ImportSessionRecord] = field(default_factory=dict)
    create_calls: list[dict] = field(default_factory=list)
    commit_calls: list[dict] = field(default_factory=list)
    undo_pointer_calls: list[dict] = field(default_factory=list)
    cleared_undo_pointers: list[UUID] = field(default_factory=list)
    description_edits: list[dict] = field(default_factory=list)
    undo_calls: list[UUID] = field(default_factory=list)

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
        staged: list[StagedStatementRecord] = []
        for index, detected in enumerate(statements):
            rows = _candidate_records(detected.candidate_rows)
            status = detected.status
            if status == STATEMENT_STATUS_STAGED and statement_is_fully_resolved(
                [row.status for row in rows]
            ):
                status = STATEMENT_STATUS_COMMITTED
            staged.append(
                StagedStatementRecord(
                    id=uuid4(),
                    session_id=session_id,
                    product_id=detected.product_id,
                    status=status,
                    candidate_row_count=len(rows),
                    pdf_path=pdf_paths[index],
                    iban=detected.iban,
                    card_id=detected.card_id,
                    original_filename=detected.original_filename,
                    candidate_rows=rows,
                )
            )
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

    def set_statement_card_id(
        self, *, session_id: UUID, user_id: UUID, statement_id: UUID, card_id: UUID
    ) -> None:
        record = self.sessions.get(session_id)
        if record is None or record.user_id != user_id:
            raise ImportSessionNotFoundError()
        updated_statements: list[StagedStatementRecord] = []
        found = False
        for statement in record.statements:
            if statement.id != statement_id:
                updated_statements.append(statement)
                continue
            found = True
            updated_statements.append(_copy_statement(statement, card_id=card_id))
        if not found:
            raise ImportStatementNotFoundError()
        self.sessions[session_id] = ImportSessionRecord(
            id=record.id,
            user_id=record.user_id,
            created_at=record.created_at,
            discarded_at=record.discarded_at,
            statements=updated_statements,
        )

    def commit_statement_batch(
        self,
        *,
        batch_id: UUID,
        session_id: UUID,
        statement_id: UUID,
        list_id: UUID,
        actor_user_id: UUID,
        rows: list[CommitRow],
        undo_row_id: UUID | None = None,
    ) -> ImportBatchRecord:
        record = self.sessions[session_id]
        targeted = {row.candidate_row_id for row in rows}
        updated_statements: list[StagedStatementRecord] = []
        for statement in record.statements:
            if statement.id != statement_id:
                updated_statements.append(statement)
                continue
            updated_rows: list[CandidateRowRecord] = []
            pending_hits = 0
            for candidate in statement.candidate_rows:
                if candidate.id not in targeted:
                    updated_rows.append(candidate)
                    continue
                if candidate.status != ROW_STATUS_PENDING:
                    raise ImportRowNotAvailableError()
                pending_hits += 1
                updated_rows.append(
                    CandidateRowRecord(
                        id=candidate.id,
                        sequence=candidate.sequence,
                        status=ROW_STATUS_COMMITTED,
                        resolved_list_id=list_id,
                        line=candidate.line,
                    )
                )
            if pending_hits != len(rows):
                raise ImportRowNotAvailableError()
            status = (
                STATEMENT_STATUS_COMMITTED
                if statement_is_fully_resolved([row.status for row in updated_rows])
                else statement.status
            )
            updated_statements.append(
                _copy_statement(statement, status=status, candidate_rows=updated_rows)
            )
        self.commit_calls.append(
            {
                "batch_id": batch_id,
                "session_id": session_id,
                "statement_id": statement_id,
                "list_id": list_id,
                "actor_user_id": actor_user_id,
                "rows": rows,
                "undo_row_id": undo_row_id,
            }
        )
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

    def mark_candidate_row_deleted(
        self, *, session_id: UUID, statement_id: UUID, row_id: UUID, user_id: UUID
    ) -> ImportSessionRecord:
        record = self.sessions[session_id]
        if record.user_id != user_id:
            raise ImportSessionNotFoundError()
        updated_statements: list[StagedStatementRecord] = []
        found = False
        for statement in record.statements:
            if statement.id != statement_id:
                updated_statements.append(statement)
                continue
            updated_rows: list[CandidateRowRecord] = []
            for candidate in statement.candidate_rows:
                if candidate.id != row_id:
                    updated_rows.append(candidate)
                    continue
                found = True
                if candidate.status != ROW_STATUS_PENDING:
                    raise ImportRowNotAvailableError()
                updated_rows.append(
                    CandidateRowRecord(
                        id=candidate.id,
                        sequence=candidate.sequence,
                        status=ROW_STATUS_DELETED,
                        resolved_list_id=None,
                        line=candidate.line,
                    )
                )
            status = (
                STATEMENT_STATUS_COMMITTED
                if statement_is_fully_resolved([row.status for row in updated_rows])
                else statement.status
            )
            updated_statements.append(
                _copy_statement(statement, status=status, candidate_rows=updated_rows)
            )
        if not found:
            raise ImportRowNotAvailableError()
        updated = ImportSessionRecord(
            id=record.id,
            user_id=record.user_id,
            created_at=record.created_at,
            discarded_at=record.discarded_at,
            statements=updated_statements,
        )
        self.sessions[session_id] = updated
        return updated

    def set_row_status(self, session_id: UUID, row_id: UUID, status: str) -> None:
        record = self.sessions[session_id]
        updated_statements: list[StagedStatementRecord] = []
        for statement in record.statements:
            updated_rows = [
                CandidateRowRecord(
                    id=candidate.id,
                    sequence=candidate.sequence,
                    status=status if candidate.id == row_id else candidate.status,
                    resolved_list_id=candidate.resolved_list_id,
                    line=candidate.line,
                )
                for candidate in statement.candidate_rows
            ]
            updated_statements.append(_copy_statement(statement, candidate_rows=updated_rows))
        self.sessions[session_id] = ImportSessionRecord(
            id=record.id,
            user_id=record.user_id,
            created_at=record.created_at,
            discarded_at=record.discarded_at,
            statements=updated_statements,
        )

    def update_candidate_row_description(
        self,
        *,
        session_id: UUID,
        statement_id: UUID,
        row_id: UUID,
        user_id: UUID,
        description: str,
    ) -> ImportSessionRecord:
        self.description_edits.append(
            {
                "session_id": session_id,
                "statement_id": statement_id,
                "row_id": row_id,
                "user_id": user_id,
                "description": description,
            }
        )
        return self.sessions[session_id]

    def set_undo_pointer(
        self,
        *,
        session_id: UUID,
        user_id: UUID,
        row_id: UUID,
        action: str,
        prior_status: str,
    ) -> None:
        self.undo_pointer_calls.append(
            {
                "session_id": session_id,
                "user_id": user_id,
                "row_id": row_id,
                "action": action,
                "prior_status": prior_status,
            }
        )

    def clear_undo_pointer(self, *, session_id: UUID, user_id: UUID) -> None:
        self.cleared_undo_pointers.append(session_id)

    def undo_last_resolution(self, *, session_id: UUID, user_id: UUID) -> ImportSessionRecord:
        self.undo_calls.append(session_id)
        return self.sessions[session_id]

    def clear_statement_pdf_paths(self, session_id: UUID, user_id: UUID) -> None:
        record = self.sessions.get(session_id)
        if record is None or record.user_id != user_id:
            return
        updated_statements = [_copy_statement(s, pdf_path=None) for s in record.statements]
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


class _FakeCardMatch:
    def execute(self, command: object) -> None:
        return None


def test_upload_non_pdf_rejected_before_storage() -> None:
    storage = _FakePdfStorage()
    repo = _FakeImportSessionRepo()
    service = UploadStatementPdfService(storage, [FakeAdapter()], repo, _FakeCardMatch())

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
    service = UploadStatementPdfService(storage, [], repo, _FakeCardMatch())

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
    service = UploadStatementPdfService(storage, [adapter], repo, _FakeCardMatch())

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
    service = UploadStatementPdfService(storage, [adapter], repo, _FakeCardMatch())

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
    service = UploadStatementPdfService(storage, [adapter], repo, _FakeCardMatch())
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
    service = UploadStatementPdfService(storage, [adapter], repo, _FakeCardMatch())
    session = service.execute(
        UploadStatementPdfCommand(
            actor_user_id=user_id, filename="statement.pdf", content=PDF_BYTES
        )
    )
    return session.id


def _direct_session(
    repo: _FakeImportSessionRepo,
    *,
    user_id: UUID,
    statements: list[DetectedStatement],
) -> UUID:
    session_id = uuid4()
    repo.create_session(
        session_id=session_id,
        user_id=user_id,
        statements=statements,
        pdf_paths={index: f"/data/pdfs/{user_id}/{index}.pdf" for index in range(len(statements))},
    )
    return session_id


def _staged(*rows: CanonicalLine, card_id: UUID | None = None) -> DetectedStatement:
    return DetectedStatement(
        product_id="fake_product",
        status=STATEMENT_STATUS_STAGED,
        candidate_rows=list(rows),
        card_id=card_id,
    )


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
        commit_row = call["rows"][0]
        assert commit_row.draft.payer_id == actor
        assert commit_row.draft.provenance == "parser"
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


def test_bulk_assign_already_committed_session_has_no_staged_to_commit() -> None:
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

    with pytest.raises(NoCleanStatementsToCommitError):
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


# --- Story 4.10 Task 5: bulk skip zeros + per-row assign/delete ----------------------


def _zero_row(desc: str = "zero") -> CanonicalLine:
    return CanonicalLine(
        posted_date="2026-01-01",
        amount=Decimal("0.00"),
        currency="CRC",
        product_id="fake_product",
        line_type="purchase",
        normalized_description=desc,
    )


def test_bulk_assign_skips_zero_amount_rows_and_commits_remaining() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[[_zero_row(), _row("keep")]]
    )
    session = repo.get_session(session_id, actor)
    statuses = {row.status for row in session.statements[0].candidate_rows}
    assert ROW_STATUS_EXCLUDED_ZERO_AMOUNT in statuses
    assert ROW_STATUS_PENDING in statuses

    result = AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
        AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
    )

    assert len(result.batches) == 1
    assert len(repo.commit_calls[0]["rows"]) == 1
    assert repo.commit_calls[0]["rows"][0].draft.normalized_description == "keep"
    updated = repo.get_session(session_id, actor)
    by_desc = {
        row.line.normalized_description: row.status for row in updated.statements[0].candidate_rows
    }
    assert by_desc["zero"] == ROW_STATUS_EXCLUDED_ZERO_AMOUNT
    assert by_desc["keep"] == ROW_STATUS_COMMITTED
    assert updated.statements[0].status == STATEMENT_STATUS_COMMITTED


def test_bulk_assign_rejects_statement_with_non_pending_row_no_commit() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[[_row("a"), _row("b")]]
    )
    session = repo.get_session(session_id, actor)
    already = session.statements[0].candidate_rows[0]
    repo.set_row_status(session_id, already.id, ROW_STATUS_COMMITTED)

    with pytest.raises(ImportRowNotAvailableError):
        AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
            AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
        )
    assert repo.commit_calls == []


def test_assign_candidate_row_writes_one_batch_sibling_stays_pending() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[[_row("a"), _row("b")]]
    )
    session = repo.get_session(session_id, actor)
    target = session.statements[0].candidate_rows[0]

    result = AssignCandidateRowService(repo, lookup, _FakeFxService(), storage).execute(
        AssignCandidateRowCommand(
            actor_user_id=actor, session_id=session_id, row_id=target.id, list_id=list_id
        )
    )

    assert len(result.ledger_entry_ids) == 1
    assert len(repo.commit_calls) == 1
    assert repo.commit_calls[0]["rows"][0].candidate_row_id == target.id
    updated = repo.get_session(session_id, actor)
    by_id = {row.id: row for row in updated.statements[0].candidate_rows}
    assert by_id[target.id].status == ROW_STATUS_COMMITTED
    sibling = next(row for row in updated.statements[0].candidate_rows if row.id != target.id)
    assert sibling.status == ROW_STATUS_PENDING
    assert updated.statements[0].status == STATEMENT_STATUS_STAGED
    assert storage.deleted == []


def test_assign_candidate_row_second_assign_raises_not_available() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    session = repo.get_session(session_id, actor)
    target = session.statements[0].candidate_rows[0]
    service = AssignCandidateRowService(repo, lookup, _FakeFxService(), storage)
    command = AssignCandidateRowCommand(
        actor_user_id=actor, session_id=session_id, row_id=target.id, list_id=list_id
    )
    service.execute(command)

    with pytest.raises(ImportRowNotAvailableError):
        service.execute(command)
    assert len(repo.commit_calls) == 1


def test_assign_candidate_row_unknown_id_not_found() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])

    with pytest.raises(ImportRowNotFoundError):
        AssignCandidateRowService(repo, lookup, _FakeFxService(), storage).execute(
            AssignCandidateRowCommand(
                actor_user_id=actor, session_id=session_id, row_id=uuid4(), list_id=list_id
            )
        )
    assert repo.commit_calls == []


def test_delete_candidate_row_then_all_deleted_statement_commits() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    actor = uuid4()
    session_id = _multi_statement_session(
        repo, storage, user_id=actor, parse_results=[[_row("a"), _row("b")]]
    )
    session = repo.get_session(session_id, actor)
    first, second = session.statements[0].candidate_rows
    service = DeleteCandidateRowService(repo, storage)

    after_first = service.execute(
        DeleteCandidateRowCommand(actor_user_id=actor, session_id=session_id, row_id=first.id)
    )
    assert after_first.statements[0].status == STATEMENT_STATUS_STAGED
    assert storage.deleted == []

    after_all = service.execute(
        DeleteCandidateRowCommand(actor_user_id=actor, session_id=session_id, row_id=second.id)
    )
    assert after_all.statements[0].status == STATEMENT_STATUS_COMMITTED
    assert {row.status for row in after_all.statements[0].candidate_rows} == {ROW_STATUS_DELETED}
    assert storage.deleted == [f"/data/pdfs/{storage.saved[0][0]}/0.pdf"]


def test_assign_candidate_row_discarded_session_rejected() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    session = repo.get_session(session_id, actor)
    target = session.statements[0].candidate_rows[0]
    DiscardImportSessionService(repo, storage).execute(
        DiscardImportSessionCommand(actor_user_id=actor, session_id=session_id)
    )

    with pytest.raises(ImportSessionDiscardedError):
        AssignCandidateRowService(repo, lookup, _FakeFxService(), storage).execute(
            AssignCandidateRowCommand(
                actor_user_id=actor, session_id=session_id, row_id=target.id, list_id=list_id
            )
        )
    assert repo.commit_calls == []


def test_staged_statement_record_has_no_unchecked_routing_mode_field() -> None:
    """Canary (Story 4.7): card_id on a statement is origin, not routing.
    routing_mode still requires an explicit bulk gate if it ever lands here.
    """
    from dataclasses import fields

    staged_names = {f.name for f in fields(StagedStatementRecord)}
    detected_names = {f.name for f in fields(DetectedStatement)}
    leaked = (staged_names | detected_names) & {"routing_mode"}
    assert not leaked, (
        f"{leaked} landed on a statement record without a routing_mode gate in "
        "AssignBulkImportService.execute (Story 4.7 review finding) — add the "
        "AC #1 review-routing check before removing this canary."
    )


def test_bulk_assign_stamps_origin_from_statement_card_id() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    card_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _direct_session(
        repo, user_id=actor, statements=[_staged(_row("r1"), _row("r2"), card_id=card_id)]
    )

    AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
        AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
    )

    drafts = [row.draft for row in repo.commit_calls[0]["rows"]]
    assert len(drafts) == 2
    assert all(d.origin_kind == ORIGIN_KIND_CARD for d in drafts)
    assert all(d.origin_card_id == card_id for d in drafts)


def test_bulk_assign_blank_origin_when_statement_has_no_card() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _direct_session(repo, user_id=actor, statements=[_staged(_row("r1"))])

    AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
        AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
    )

    draft = repo.commit_calls[0]["rows"][0].draft
    assert draft.origin_kind is None
    assert draft.origin_card_id is None


def test_bulk_assign_origin_does_not_bleed_across_statements() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    card_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _direct_session(
        repo,
        user_id=actor,
        statements=[_staged(_row("with-card"), card_id=card_id), _staged(_row("no-card"))],
    )

    AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
        AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
    )

    session = repo.get_session(session_id, actor)
    by_statement = {call["statement_id"]: call for call in repo.commit_calls}
    with_card = session.statements[0]
    without = session.statements[1]
    stamped = by_statement[with_card.id]["rows"][0].draft
    blank = by_statement[without.id]["rows"][0].draft
    assert stamped.origin_kind == ORIGIN_KIND_CARD
    assert stamped.origin_card_id == card_id
    assert blank.origin_kind is None
    assert blank.origin_card_id is None


def test_assign_candidate_row_uses_statement_card_id_when_command_omits_it() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    card_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _direct_session(
        repo, user_id=actor, statements=[_staged(_row("a"), _row("b"), card_id=card_id)]
    )
    session = repo.get_session(session_id, actor)
    target = session.statements[0].candidate_rows[0]

    AssignCandidateRowService(repo, lookup, _FakeFxService(), storage).execute(
        AssignCandidateRowCommand(
            actor_user_id=actor, session_id=session_id, row_id=target.id, list_id=list_id
        )
    )

    draft = repo.commit_calls[0]["rows"][0].draft
    assert draft.origin_kind == ORIGIN_KIND_CARD
    assert draft.origin_card_id == card_id
    assert repo.commit_calls[0]["undo_row_id"] == target.id


def test_undo_unknown_session_not_found_before_repo_call() -> None:
    repo = _FakeImportSessionRepo()
    with pytest.raises(ImportSessionNotFoundError):
        UndoLastResolutionService(repo).execute(
            UndoLastResolutionCommand(actor_user_id=uuid4(), session_id=uuid4())
        )
    assert repo.undo_calls == []


def test_undo_discarded_session_rejected_before_repo_call() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    actor = uuid4()
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    DiscardImportSessionService(repo, storage).execute(
        DiscardImportSessionCommand(actor_user_id=actor, session_id=session_id)
    )

    with pytest.raises(ImportSessionDiscardedError):
        UndoLastResolutionService(repo).execute(
            UndoLastResolutionCommand(actor_user_id=actor, session_id=session_id)
        )
    assert repo.undo_calls == []


def test_edit_candidate_row_discarded_session_rejected_before_repo_call() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    actor = uuid4()
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    row_id = repo.get_session(session_id, actor).statements[0].candidate_rows[0].id
    DiscardImportSessionService(repo, storage).execute(
        DiscardImportSessionCommand(actor_user_id=actor, session_id=session_id)
    )

    with pytest.raises(ImportSessionDiscardedError):
        EditCandidateRowService(repo).execute(
            EditCandidateRowCommand(
                actor_user_id=actor,
                session_id=session_id,
                row_id=row_id,
                description="Coffee",
            )
        )
    assert repo.description_edits == []


def test_edit_candidate_row_unknown_id_not_found() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    actor = uuid4()
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])

    with pytest.raises(ImportRowNotFoundError):
        EditCandidateRowService(repo).execute(
            EditCandidateRowCommand(
                actor_user_id=actor,
                session_id=session_id,
                row_id=uuid4(),
                description="Coffee",
            )
        )
    assert repo.description_edits == []


def test_edit_candidate_row_blank_description_rejected() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    actor = uuid4()
    session_id = _multi_statement_session(repo, storage, user_id=actor, parse_results=[[_row()]])
    row_id = repo.get_session(session_id, actor).statements[0].candidate_rows[0].id

    with pytest.raises(InvalidCanonicalLineError):
        EditCandidateRowService(repo).execute(
            EditCandidateRowCommand(
                actor_user_id=actor,
                session_id=session_id,
                row_id=row_id,
                description="   ",
            )
        )
    assert repo.description_edits == []


def test_bulk_assign_clears_undo_pointer() -> None:
    repo = _FakeImportSessionRepo()
    storage = _FakePdfStorage()
    lookup = _FakeListLookup()
    actor = uuid4()
    list_id = uuid4()
    lookup.add_member(list_id, owner_id=actor, user_id=actor)
    session_id = _direct_session(repo, user_id=actor, statements=[_staged(_row("r1"))])

    AssignBulkImportService(repo, lookup, _FakeFxService(), storage).execute(
        AssignBulkImportCommand(actor_user_id=actor, session_id=session_id, list_id=list_id)
    )

    assert repo.cleared_undo_pointers == [session_id]
    assert repo.commit_calls[0]["undo_row_id"] is None
