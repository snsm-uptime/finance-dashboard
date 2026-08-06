"""SQLAlchemy signup / auth user repositories."""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

from application.lists import (
    PLACEHOLDER_BALANCE_CRC,
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
from domain.default_split import MODE_EVEN, MODE_PERCENTAGE
from domain.errors import (
    DuplicateEmailError,
    ListNotFoundError,
    ListWriteError,
    NotListMemberError,
    PrincipalNotFoundError,
)
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from adapters.persistence.models import (
    ListDefaultSplitShareModel,
    ListMembershipModel,
    ListModel,
    UserModel,
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
        return UserPreferencesRecord(
            id=row.id,
            email=row.email,
            language=row.language,
            theme=row.theme,
            last_opened_list_id=row.last_opened_list_id,
        )

    def update_preferences(
        self,
        user_id: UUID,
        *,
        language: str | None = None,
        theme: str | None = None,
        last_opened_list_id: UUID | None = None,
        clear_last_opened_list_id: bool = False,
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
        try:
            self._session.flush()
        except IntegrityError as exc:
            if last_opened_list_id is not None:
                raise NotListMemberError() from exc
            raise
        return UserPreferencesRecord(
            id=row.id,
            email=row.email,
            language=row.language,
            theme=row.theme,
            last_opened_list_id=row.last_opened_list_id,
        )


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

    def update_list_name(self, list_id: UUID, name: str) -> ListRecord:
        row = self._session.get(ListModel, list_id)
        if row is None:
            raise ListNotFoundError()
        row.name = name
        self._session.flush()
        return ListRecord(id=row.id, name=row.name, owner_id=row.owner_id)

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
        return [
            ListMembershipSummary(
                id=lst.id,
                name=lst.name,
                owner_id=lst.owner_id,
                role=role,
                balance_crc=PLACEHOLDER_BALANCE_CRC,
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
            delete(ListDefaultSplitShareModel).where(
                ListDefaultSplitShareModel.list_id == list_id
            )
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
