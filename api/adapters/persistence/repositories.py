"""SQLAlchemy signup / auth user repositories."""

from __future__ import annotations

from application.ports import NewListRecord, NewMembershipRecord, NewUserRecord
from application.signin import AuthUserRecord
from sqlalchemy import select
from sqlalchemy.orm import Session

from adapters.persistence.models import ListMembershipModel, ListModel, UserModel


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
        self._session.add(
            UserModel(
                id=user.id,
                email=user.email,
                password_hash=user.password_hash,
            )
        )
        self._session.flush()
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
