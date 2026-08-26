"""SQLAlchemy signup / auth user repositories."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

from application.cards import CardRecord
from application.lists import (
    PLACEHOLDER_BALANCE_CRC,
    ListMemberLabel,
    ListMembershipSummary,
    ListRecord,
    MembershipRecord,
    StoredDefaultSplit,
)
from application.ports import (
    ListAccessGrant,
    NewListRecord,
    NewMembershipRecord,
    NewUserRecord,
    UserPreferencesRecord,
)
from application.signin import AuthUserRecord
from application.splits import AllocatableSubject, StoredSplitOverride
from domain.default_split import MODE_EVEN, MODE_PERCENTAGE, validate_percentage_shares
from domain.errors import (
    AliasAlreadySetError,
    AliasTakenError,
    DuplicateEmailError,
    InvalidDefaultSplitError,
    InvalidSplitOverrideError,
    ListNotFoundError,
    ListWriteError,
    NotEntryPayerError,
    NotListMemberError,
    PrincipalNotFoundError,
    SubjectNotFoundError,
)
from domain.splits import (
    KIND_ABSOLUTE_AMOUNTS,
    KIND_PERCENTAGE,
    KIND_WHOLE_ASSIGNEE,
)
from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from adapters.persistence.models import (
    CardModel,
    ImportBatchModel,
    ImportCandidateRowModel,
    LedgerEntryModel,
    ListDefaultSplitShareModel,
    ListMembershipModel,
    ListModel,
    ReceiptModel,
    SplitOverrideModel,
    UserModel,
)


def _ledger_entry_record(row: LedgerEntryModel, statement_id: UUID | None = None):
    from application.expenses import LedgerEntryRecord

    return LedgerEntryRecord(
        id=row.id,
        list_id=row.list_id,
        amount=Decimal(str(row.amount)),
        currency=row.currency,
        normalized_description=row.normalized_description or "",
        payer_id=row.payer_id,
        provenance=row.provenance or "",
        line_type=row.line_type or "",
        posted_date=row.posted_date,
        created_at=row.created_at,
        amount_crc=Decimal(str(row.amount_crc)),
        fx_rate=Decimal(str(row.fx_rate)),
        fx_rate_date=row.fx_rate_date,
        fx_fallback=row.fx_fallback,
        receipt_id=row.receipt_id,
        product_id=row.product_id,
        external_ref=row.external_ref,
        origin_kind=row.origin_kind,
        origin_card_id=row.origin_card_id,
        import_batch_id=row.import_batch_id,
        statement_id=statement_id,
    )


def _preferences_record(row: UserModel) -> UserPreferencesRecord:
    return UserPreferencesRecord(
        id=row.id,
        email=row.email,
        language=row.language,
        theme=row.theme,
        last_opened_list_id=row.last_opened_list_id,
        default_import_list_id=row.default_import_list_id,
        alias=row.alias,
    )


class SqlAlchemySignupRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def email_exists(self, email: str) -> bool:
        stmt = select(UserModel.id).where(UserModel.email == email).limit(1)
        return self._session.scalar(stmt) is not None

    def create_user_with_personal_list(
        self,
        *,
        user: NewUserRecord,
        personal_list: NewListRecord,
        membership: NewMembershipRecord,
    ) -> None:
        try:
            with self._session.begin_nested():
                self._session.add(
                    UserModel(
                        id=user.id,
                        email=user.email,
                        password_hash=user.password_hash,
                    )
                )
                self._session.flush()
        except IntegrityError as exc:
            raise DuplicateEmailError("An account with this email already exists.") from exc
        self._session.add(
            ListModel(
                id=personal_list.id,
                name=personal_list.name,
                owner_id=personal_list.owner_id,
            )
        )
        self._session.flush()
        self._session.add(
            ListMembershipModel(
                id=membership.id,
                list_id=membership.list_id,
                user_id=membership.user_id,
                role=membership.role,
            )
        )


class SqlAlchemyAuthUserRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_email(self, email: str) -> AuthUserRecord | None:
        row = self._session.scalar(select(UserModel).where(UserModel.email == email).limit(1))
        if row is None:
            return None
        return AuthUserRecord(id=row.id, email=row.email, password_hash=row.password_hash)

    def get_by_id(self, user_id: UUID) -> AuthUserRecord | None:
        row = self._session.get(UserModel, user_id)
        if row is None:
            return None
        return AuthUserRecord(id=row.id, email=row.email, password_hash=row.password_hash)

    def get_preferences(self, user_id: UUID) -> UserPreferencesRecord | None:
        row = self._session.get(UserModel, user_id)
        if row is None:
            return None
        return _preferences_record(row)

    def claim_alias(self, user_id: UUID, alias: str) -> UserPreferencesRecord:
        """Set-once claim; row lock + lower(alias) unique index arbitrate races."""
        row = self._session.scalar(
            select(UserModel).where(UserModel.id == user_id).with_for_update()
        )
        if row is None:
            raise PrincipalNotFoundError()
        if row.alias:
            raise AliasAlreadySetError()
        try:
            # Assign inside the savepoint — begin_nested() autoflushes pending
            # state, which would push the UPDATE outside the savepoint and
            # poison the outer transaction when the unique index rejects it.
            with self._session.begin_nested():
                row.alias = alias
                self._session.flush()
        except IntegrityError as exc:
            raise AliasTakenError() from exc
        return _preferences_record(row)

    def update_preferences(
        self,
        user_id: UUID,
        *,
        language: str | None = None,
        theme: str | None = None,
        last_opened_list_id: UUID | None = None,
        clear_last_opened_list_id: bool = False,
        default_import_list_id: UUID | None = None,
        clear_default_import_list_id: bool = False,
    ) -> UserPreferencesRecord:
        row = self._session.get(UserModel, user_id)
        if row is None:
            raise PrincipalNotFoundError()
        if language is not None:
            row.language = language
        if theme is not None:
            row.theme = theme
        if clear_last_opened_list_id:
            row.last_opened_list_id = None
        elif last_opened_list_id is not None:
            row.last_opened_list_id = last_opened_list_id
        if clear_default_import_list_id:
            row.default_import_list_id = None
        elif default_import_list_id is not None:
            row.default_import_list_id = default_import_list_id
        try:
            self._session.flush()
        except IntegrityError as exc:
            if last_opened_list_id is not None or default_import_list_id is not None:
                raise NotListMemberError() from exc
            raise
        return _preferences_record(row)


class SqlAlchemyListRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create_owned_list(
        self,
        *,
        owned_list: NewListRecord,
        membership: NewMembershipRecord,
    ) -> None:
        try:
            with self._session.begin_nested():
                self._session.add(
                    ListModel(
                        id=owned_list.id,
                        name=owned_list.name,
                        owner_id=owned_list.owner_id,
                        default_split_mode=owned_list.default_split_mode or MODE_EVEN,
                    )
                )
                self._session.flush()
                self._session.add(
                    ListMembershipModel(
                        id=membership.id,
                        list_id=membership.list_id,
                        user_id=membership.user_id,
                        role=membership.role,
                    )
                )
                self._session.flush()
        except IntegrityError as exc:
            raise ListWriteError() from exc

    def get_list(self, list_id: UUID) -> ListRecord | None:
        row = self._session.get(ListModel, list_id)
        if row is None:
            return None
        return ListRecord(id=row.id, name=row.name, owner_id=row.owner_id)

    def get_membership(self, list_id: UUID, user_id: UUID) -> MembershipRecord | None:
        row = self._session.scalar(
            select(ListMembershipModel)
            .where(
                ListMembershipModel.list_id == list_id,
                ListMembershipModel.user_id == user_id,
            )
            .limit(1)
        )
        if row is None:
            return None
        return MembershipRecord(list_id=row.list_id, user_id=row.user_id, role=row.role)

    def add_membership(self, membership: NewMembershipRecord) -> None:
        try:
            with self._session.begin_nested():
                self._session.add(
                    ListMembershipModel(
                        id=membership.id,
                        list_id=membership.list_id,
                        user_id=membership.user_id,
                        role=membership.role,
                    )
                )
                self._session.flush()
        except IntegrityError as exc:
            raise ListWriteError() from exc
        self.clear_invalid_percentage_default(membership.list_id)

    def clear_invalid_percentage_default(self, list_id: UUID) -> None:
        """Hard-clear stored % → even when the map no longer matches memberships."""
        stored = self.get_stored_default_split(list_id)
        if stored is None or stored.mode != MODE_PERCENTAGE:
            return
        members = self.list_member_ids(list_id)
        try:
            validate_percentage_shares(members, stored.shares)
        except InvalidDefaultSplitError:
            self.set_default_split(list_id, mode=MODE_EVEN, shares=None)

    def update_list_name(self, list_id: UUID, name: str) -> ListRecord:
        row = self._session.get(ListModel, list_id)
        if row is None:
            raise ListNotFoundError()
        row.name = name
        self._session.flush()
        return ListRecord(id=row.id, name=row.name, owner_id=row.owner_id)

    def delete_list(self, list_id: UUID) -> None:
        row = self._session.get(ListModel, list_id)
        if row is None:
            raise ListNotFoundError()
        self._session.delete(row)
        self._session.flush()

    def list_for_user(self, user_id: UUID) -> list[ListMembershipSummary]:
        stmt = (
            select(ListModel, ListMembershipModel.role)
            .join(
                ListMembershipModel,
                ListMembershipModel.list_id == ListModel.id,
            )
            .where(ListMembershipModel.user_id == user_id)
            .order_by(ListModel.created_at.asc())
        )
        rows = self._session.execute(stmt).all()
        list_ids = [lst.id for lst, _ in rows]
        members_by_list: dict[UUID, list[ListMemberLabel]] = {lid: [] for lid in list_ids}
        if list_ids:
            member_stmt = (
                select(
                    ListMembershipModel.list_id,
                    ListMembershipModel.user_id,
                    UserModel.alias,
                )
                .join(UserModel, UserModel.id == ListMembershipModel.user_id)
                .where(ListMembershipModel.list_id.in_(list_ids))
                .order_by(ListMembershipModel.created_at.asc())
            )
            for list_id, member_id, alias in self._session.execute(member_stmt).all():
                members_by_list[list_id].append(ListMemberLabel(user_id=member_id, alias=alias))
        return [
            ListMembershipSummary(
                id=lst.id,
                name=lst.name,
                owner_id=lst.owner_id,
                role=role,
                balance_crc=PLACEHOLDER_BALANCE_CRC,
                members=tuple(members_by_list.get(lst.id, ())),
            )
            for lst, role in rows
        ]

    def get_list_with_grant(self, grant: ListAccessGrant, list_id: UUID) -> ListRecord:
        from application.list_access import assert_grant_list_id

        assert_grant_list_id(grant, list_id)
        row = self._session.get(ListModel, list_id)
        if row is None:
            raise ListNotFoundError()
        return ListRecord(id=row.id, name=row.name, owner_id=row.owner_id)

    def list_member_ids(self, list_id: UUID) -> list[UUID]:
        stmt = (
            select(ListMembershipModel.user_id)
            .where(ListMembershipModel.list_id == list_id)
            .order_by(ListMembershipModel.created_at.asc())
        )
        return list(self._session.scalars(stmt).all())

    def atomic(self):
        """Nested savepoint — rolls back create+override without outer session.rollback()."""
        return self._session.begin_nested()

    def get_stored_default_split(self, list_id: UUID) -> StoredDefaultSplit | None:
        row = self._session.get(ListModel, list_id)
        if row is None:
            return None
        mode = row.default_split_mode or MODE_EVEN
        shares: dict[UUID, Decimal] = {}
        if mode == MODE_PERCENTAGE:
            share_rows = self._session.scalars(
                select(ListDefaultSplitShareModel).where(
                    ListDefaultSplitShareModel.list_id == list_id
                )
            ).all()
            shares = {s.user_id: Decimal(str(s.percentage)) for s in share_rows}
        return StoredDefaultSplit(mode=mode, shares=shares)

    def set_default_split(
        self,
        list_id: UUID,
        *,
        mode: str,
        shares: dict[UUID, Decimal] | None,
    ) -> None:
        row = self._session.get(ListModel, list_id)
        if row is None:
            raise ListNotFoundError()
        row.default_split_mode = mode
        self._session.execute(
            delete(ListDefaultSplitShareModel).where(ListDefaultSplitShareModel.list_id == list_id)
        )
        if mode == MODE_PERCENTAGE and shares:
            for user_id, percentage in shares.items():
                self._session.add(
                    ListDefaultSplitShareModel(
                        id=uuid4(),
                        list_id=list_id,
                        user_id=user_id,
                        percentage=percentage,
                    )
                )
        self._session.flush()

    def get_ledger_entry(self, list_id: UUID, entry_id: UUID) -> AllocatableSubject | None:
        row = self._session.get(LedgerEntryModel, entry_id)
        if row is None or row.list_id != list_id:
            return None
        return AllocatableSubject(
            id=row.id,
            list_id=row.list_id,
            amount=Decimal(str(row.amount)),
            currency=row.currency,
            receipt_id=row.receipt_id,
        )

    def create_ledger_entry(
        self,
        *,
        entry_id: UUID,
        list_id: UUID,
        draft,
        fx,
    ):
        from datetime import UTC, datetime
        from datetime import date as date_cls

        from domain.expenses import ManualExpenseDraft

        assert isinstance(draft, ManualExpenseDraft)
        posted = date_cls.fromisoformat(draft.posted_date)
        # Set created_at in app code — Postgres now() is transaction-scoped and
        # collapses newest-first ordering when multiple creates share a test txn.
        created_at = datetime.now(UTC)
        row = LedgerEntryModel(
            id=entry_id,
            list_id=list_id,
            amount=draft.amount,
            currency=draft.currency,
            normalized_description=draft.normalized_description,
            payer_id=draft.payer_id,
            provenance=draft.provenance,
            line_type=draft.line_type,
            posted_date=posted,
            receipt_id=None,
            product_id=None,
            external_ref=None,
            origin_kind=draft.origin_kind,
            origin_card_id=draft.origin_card_id,
            amount_crc=fx.amount_crc,
            fx_rate=fx.fx_rate,
            fx_rate_date=fx.fx_rate_date,
            fx_fallback=fx.fx_fallback,
            created_at=created_at,
        )
        self._session.add(row)
        self._session.flush()  # make id readable for split override attach
        return _ledger_entry_record(row)

    def list_ledger_entries(self, list_id: UUID):
        from application.expenses import LedgerEntryRecord

        stmt = (
            select(LedgerEntryModel, ImportBatchModel.statement_id)
            .outerjoin(ImportBatchModel, ImportBatchModel.id == LedgerEntryModel.import_batch_id)
            .where(LedgerEntryModel.list_id == list_id)
            .order_by(LedgerEntryModel.created_at.desc(), LedgerEntryModel.id.desc())
        )
        result: list[LedgerEntryRecord] = []
        for row, statement_id in self._session.execute(stmt).all():
            if (
                row.normalized_description is None
                or row.payer_id is None
                or row.provenance is None
                or row.line_type is None
                or row.posted_date is None
            ):
                # Skip incomplete stub rows from pre-3.2 seeds (tests only).
                continue
            result.append(_ledger_entry_record(row, statement_id))
        return result

    def get_card_for_owner(self, user_id: UUID, card_id: UUID) -> CardRecord | None:
        row = self._session.scalar(
            select(CardModel).where(CardModel.id == card_id, CardModel.user_id == user_id).limit(1)
        )
        if row is None:
            return None
        return CardRecord(
            id=row.id,
            user_id=row.user_id,
            label=row.label,
            iban=row.iban,
            created_at=row.created_at,
            routing_mode=row.routing_mode,
            fixed_list_id=row.fixed_list_id,
        )

    def get_ledger_entry_payer(self, *, list_id: UUID, entry_id: UUID) -> UUID | None:
        row = self._session.get(LedgerEntryModel, entry_id)
        if (
            row is None
            or row.list_id != list_id
            or row.normalized_description is None
            or row.payer_id is None
            or row.provenance is None
            or row.line_type is None
            or row.posted_date is None
        ):
            return None
        return row.payer_id

    def update_ledger_entry_origin(
        self,
        *,
        list_id: UUID,
        entry_id: UUID,
        actor_user_id: UUID,
        origin_kind: str | None,
        origin_card_id: UUID | None,
    ):
        row = self._session.get(LedgerEntryModel, entry_id)
        if (
            row is None
            or row.list_id != list_id
            or row.normalized_description is None
            or row.payer_id is None
            or row.provenance is None
            or row.line_type is None
            or row.posted_date is None
        ):
            raise SubjectNotFoundError()
        if row.payer_id != actor_user_id:
            raise NotEntryPayerError()
        row.origin_kind = origin_kind
        row.origin_card_id = origin_card_id
        self._session.flush()
        statement_id = None
        if row.import_batch_id is not None:
            batch = self._session.get(ImportBatchModel, row.import_batch_id)
            statement_id = batch.statement_id if batch is not None else None
        return _ledger_entry_record(row, statement_id)

    def list_members_with_alias(self, list_id: UUID):
        """Roster labels are aliases — email is an identity surface, never a label."""
        from application.expenses import ListMemberView

        stmt = (
            select(ListMembershipModel.user_id, UserModel.alias)
            .join(UserModel, UserModel.id == ListMembershipModel.user_id)
            .where(ListMembershipModel.list_id == list_id)
            .order_by(ListMembershipModel.created_at.asc())
        )
        return [
            ListMemberView(user_id=user_id, alias=alias)
            for user_id, alias in self._session.execute(stmt).all()
        ]

    def get_receipt(self, list_id: UUID, receipt_id: UUID) -> AllocatableSubject | None:
        row = self._session.get(ReceiptModel, receipt_id)
        if row is None or row.list_id != list_id:
            return None
        return AllocatableSubject(
            id=row.id,
            list_id=row.list_id,
            amount=Decimal(str(row.amount)),
            currency=row.currency,
            receipt_id=None,
        )

    def get_split_override(
        self, list_id: UUID, subject_kind: str, subject_id: UUID
    ) -> StoredSplitOverride | None:
        stmt = select(SplitOverrideModel).where(
            SplitOverrideModel.list_id == list_id,
            SplitOverrideModel.subject_kind == subject_kind,
            SplitOverrideModel.subject_id == subject_id,
        )
        row = self._session.scalars(stmt).first()
        if row is None:
            return None
        return _stored_override_from_row(row)

    def upsert_split_override(
        self,
        *,
        list_id: UUID,
        subject_kind: str,
        subject_id: UUID,
        kind: str,
        payload: dict,
        set_by_user_id: UUID,
    ) -> StoredSplitOverride:
        from datetime import UTC, datetime

        stmt = select(SplitOverrideModel).where(
            SplitOverrideModel.list_id == list_id,
            SplitOverrideModel.subject_kind == subject_kind,
            SplitOverrideModel.subject_id == subject_id,
        )
        row = self._session.scalars(stmt).first()
        now = datetime.now(UTC)
        if row is None:
            try:
                with self._session.begin_nested():
                    row = SplitOverrideModel(
                        id=uuid4(),
                        list_id=list_id,
                        subject_kind=subject_kind,
                        subject_id=subject_id,
                        kind=kind,
                        payload=payload,
                        set_by_user_id=set_by_user_id,
                        updated_at=now,
                    )
                    self._session.add(row)
                    self._session.flush()
            except IntegrityError:
                # Concurrent INSERT on the same subject — reload and update.
                row = self._session.scalars(stmt).first()
                if row is None or row.list_id != list_id:
                    raise ListWriteError() from None
                row.kind = kind
                row.payload = payload
                row.set_by_user_id = set_by_user_id
                row.updated_at = now
                self._session.flush()
        else:
            row.kind = kind
            row.payload = payload
            row.set_by_user_id = set_by_user_id
            row.updated_at = now
            self._session.flush()
        return _stored_override_from_row(row)

    def delete_split_override(self, list_id: UUID, subject_kind: str, subject_id: UUID) -> bool:
        stmt = select(SplitOverrideModel).where(
            SplitOverrideModel.list_id == list_id,
            SplitOverrideModel.subject_kind == subject_kind,
            SplitOverrideModel.subject_id == subject_id,
        )
        row = self._session.scalars(stmt).first()
        if row is None:
            return False
        self._session.delete(row)
        self._session.flush()
        return True

    def list_statement_ledger_moves(self, statement_id: UUID):
        from application.reassign_statement import StatementLedgerMove

        stmt = (
            select(LedgerEntryModel, ImportBatchModel)
            .join(ImportBatchModel, ImportBatchModel.id == LedgerEntryModel.import_batch_id)
            .where(ImportBatchModel.statement_id == statement_id)
        )
        moves: list[StatementLedgerMove] = []
        for entry, batch in self._session.execute(stmt).all():
            if entry.import_batch_id is None:
                continue
            moves.append(
                StatementLedgerMove(
                    entry_id=entry.id,
                    list_id=entry.list_id,
                    batch_id=batch.id,
                    candidate_row_id=entry.import_candidate_row_id,
                    receipt_id=entry.receipt_id,
                    payer_id=entry.payer_id,
                    amount_crc=Decimal(str(entry.amount_crc)),
                    fx_rate=Decimal(str(entry.fx_rate)),
                    fx_fallback=entry.fx_fallback,
                    import_identity=entry.import_identity,
                )
            )
        return moves

    def apply_statement_reassign(
        self,
        *,
        destination_list_id: UUID,
        entry_ids: tuple[UUID, ...],
        batch_ids: tuple[UUID, ...],
        candidate_ids: tuple[UUID, ...],
        receipt_ids: tuple[UUID, ...],
        from_list_ids: tuple[UUID, ...],
        override_keys: tuple[tuple[str, UUID], ...],
    ) -> None:
        if entry_ids:
            self._session.execute(
                update(LedgerEntryModel)
                .where(LedgerEntryModel.id.in_(entry_ids))
                .values(list_id=destination_list_id)
            )
        if batch_ids:
            self._session.execute(
                update(ImportBatchModel)
                .where(ImportBatchModel.id.in_(batch_ids))
                .values(list_id=destination_list_id)
            )
        if candidate_ids:
            self._session.execute(
                update(ImportCandidateRowModel)
                .where(ImportCandidateRowModel.id.in_(candidate_ids))
                .values(resolved_list_id=destination_list_id)
            )
        if receipt_ids:
            self._session.execute(
                update(ReceiptModel)
                .where(ReceiptModel.id.in_(receipt_ids))
                .values(list_id=destination_list_id)
            )
        if override_keys and from_list_ids:
            for kind, subject_id in override_keys:
                self._session.execute(
                    update(SplitOverrideModel)
                    .where(
                        SplitOverrideModel.subject_kind == kind,
                        SplitOverrideModel.subject_id == subject_id,
                        SplitOverrideModel.list_id.in_(from_list_ids),
                    )
                    .values(list_id=destination_list_id)
                )
        self._session.flush()


def _stored_override_from_row(row: SplitOverrideModel) -> StoredSplitOverride:
    assignee_id: UUID | None = None
    amounts: dict[UUID, Decimal] | None = None
    percentages: dict[UUID, Decimal] | None = None
    payload = row.payload or {}
    try:
        if row.kind == KIND_WHOLE_ASSIGNEE:
            assignee_id = UUID(str(payload["assignee_id"]))
        elif row.kind == KIND_ABSOLUTE_AMOUNTS:
            amounts = {
                UUID(str(k)): Decimal(str(v)) for k, v in (payload.get("amounts") or {}).items()
            }
        elif row.kind == KIND_PERCENTAGE:
            percentages = {
                UUID(str(k)): Decimal(str(v)) for k, v in (payload.get("percentages") or {}).items()
            }
    except (KeyError, ValueError, TypeError) as exc:
        raise InvalidSplitOverrideError() from exc
    return StoredSplitOverride(
        list_id=row.list_id,
        subject_kind=row.subject_kind,
        subject_id=row.subject_id,
        kind=row.kind,
        assignee_id=assignee_id,
        amounts=amounts,
        percentages=percentages,
        set_by_user_id=row.set_by_user_id,
    )
