"""SQLAlchemy ORM models for users, lists, memberships, and sessions."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from adapters.persistence.base import Base


class UserModel(Base):
    __tablename__ = "users"
    # Aliases are compared case-insensitively; the DB owns that invariant.
    __table_args__ = (Index("uq_users_alias_lower", text("lower(alias)"), unique=True),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False, index=True)
    alias: Mapped[str | None] = mapped_column(String(32), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    language: Mapped[str | None] = mapped_column(String(8), nullable=True)
    theme: Mapped[str | None] = mapped_column(String(16), nullable=True)
    last_opened_list_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lists.id", ondelete="SET NULL"), nullable=True
    )
    default_import_list_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lists.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    owned_lists: Mapped[list[ListModel]] = relationship(
        back_populates="owner",
        foreign_keys="ListModel.owner_id",
    )
    memberships: Mapped[list[ListMembershipModel]] = relationship(back_populates="user")
    sessions: Mapped[list[SessionModel]] = relationship(back_populates="user")
    import_sessions: Mapped[list[ImportSessionModel]] = relationship(back_populates="user")
    password_reset_tokens: Mapped[list[PasswordResetTokenModel]] = relationship(
        back_populates="user"
    )
    email_verification_tokens: Mapped[list[EmailVerificationTokenModel]] = relationship(
        back_populates="user"
    )
    sent_list_invites: Mapped[list[ListInviteTokenModel]] = relationship(
        back_populates="inviter",
        foreign_keys="ListInviteTokenModel.inviter_user_id",
    )
    cards: Mapped[list[CardModel]] = relationship(back_populates="owner")


class ListModel(Base):
    __tablename__ = "lists"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    default_split_mode: Mapped[str] = mapped_column(
        String(32), nullable=False, default="even", server_default="even"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    owner: Mapped[UserModel] = relationship(
        back_populates="owned_lists",
        foreign_keys=[owner_id],
    )
    memberships: Mapped[list[ListMembershipModel]] = relationship(
        back_populates="list",
        cascade="all, delete-orphan",
    )
    default_split_shares: Mapped[list[ListDefaultSplitShareModel]] = relationship(
        back_populates="list",
        cascade="all, delete-orphan",
    )
    invite_tokens: Mapped[list[ListInviteTokenModel]] = relationship(
        back_populates="list",
        cascade="all, delete-orphan",
    )
    receipts: Mapped[list[ReceiptModel]] = relationship(
        back_populates="list",
        cascade="all, delete-orphan",
    )
    ledger_entries: Mapped[list[LedgerEntryModel]] = relationship(
        back_populates="list",
        cascade="all, delete-orphan",
    )
    split_overrides: Mapped[list[SplitOverrideModel]] = relationship(
        back_populates="list",
        cascade="all, delete-orphan",
    )


class ListMembershipModel(Base):
    __tablename__ = "list_memberships"
    __table_args__ = (UniqueConstraint("list_id", "user_id", name="uq_list_membership"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lists.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="owner")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    list: Mapped[ListModel] = relationship(back_populates="memberships")
    user: Mapped[UserModel] = relationship(back_populates="memberships")


class ListDefaultSplitShareModel(Base):
    __tablename__ = "list_default_split_shares"
    __table_args__ = (UniqueConstraint("list_id", "user_id", name="uq_list_default_split_share"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    percentage: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)

    list: Mapped[ListModel] = relationship(back_populates="default_split_shares")


class SessionModel(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[UserModel] = relationship(back_populates="sessions")


class PasswordResetTokenModel(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[UserModel] = relationship(back_populates="password_reset_tokens")


class EmailVerificationTokenModel(Base):
    __tablename__ = "email_verification_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped[UserModel] = relationship(back_populates="email_verification_tokens")


class ListInviteTokenModel(Base):
    __tablename__ = "list_invite_tokens"
    __table_args__ = (Index("ix_list_invite_tokens_list_id_email", "list_id", "email"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lists.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    inviter_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    list: Mapped[ListModel] = relationship(back_populates="invite_tokens")
    inviter: Mapped[UserModel] = relationship(
        back_populates="sent_list_invites",
        foreign_keys=[inviter_user_id],
    )


class ReceiptModel(Base):
    """Minimal receipt subject stub — explicit total for 2.6 overrides (Story 3.2 expands)."""

    __tablename__ = "receipts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    list: Mapped[ListModel] = relationship(back_populates="receipts")
    ledger_entries: Mapped[list[LedgerEntryModel]] = relationship(
        "LedgerEntryModel", back_populates="receipt"
    )


class LedgerEntryModel(Base):
    """LEDGER_ENTRY — hand-row subset for manual create (Story 3.2); parser fills later."""

    __tablename__ = "ledger_entries"
    __table_args__ = (
        UniqueConstraint(
            "import_candidate_row_id", name="uq_ledger_entries_import_candidate_row_id"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("receipts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # AD-16 hand subset — wire alias `description` maps at HTTP edge only.
    normalized_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    payer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=True,
        index=True,
    )
    provenance: Mapped[str | None] = mapped_column(String(16), nullable=True)
    line_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    posted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # Import stub — no FK; reserved for the future bank-adapter pipeline (product code).
    product_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    external_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Origin (card / Cash / blank) — Story 4.2. Distinct from product_id above.
    origin_kind: Mapped[str | None] = mapped_column(String(16), nullable=True)
    origin_card_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cards.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # FX materialized at commit (Story 3.5 / AD-7) — CRC entries pass through 1:1.
    amount_crc: Mapped[Decimal] = mapped_column(Numeric(19, 2), nullable=False, server_default="0")
    fx_rate: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False, server_default="1")
    fx_rate_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    fx_fallback: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    # Import Batch this row was committed under (Story 4.7, AD-4). Null for
    # hand-entered expenses — only import-sourced rows carry a batch.
    import_batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("import_batches.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Candidate row this ledger entry was committed from (Story 4.10, AD-4).
    # Null for hand-entered expenses. UNIQUE (NULLs distinct) is the
    # double-commit backstop — do not set postgresql_nulls_not_distinct.
    import_candidate_row_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("import_candidate_rows.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    list: Mapped[ListModel] = relationship(back_populates="ledger_entries")
    receipt: Mapped[ReceiptModel | None] = relationship(
        "ReceiptModel", back_populates="ledger_entries"
    )


class SplitOverrideModel(Base):
    """Persisted split override configuration (not computed share cents)."""

    __tablename__ = "split_overrides"
    __table_args__ = (
        UniqueConstraint("subject_kind", "subject_id", name="uq_split_override_subject"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    subject_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    subject_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    set_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    list: Mapped[ListModel] = relationship(back_populates="split_overrides")


class CardModel(Base):
    """A user's registered bank card, keyed by IBAN (Story 4.1 / FR-37 / AD-20)."""

    __tablename__ = "cards"
    __table_args__ = (UniqueConstraint("user_id", "iban", name="uq_cards_user_iban"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    iban: Mapped[str] = mapped_column(String(64), nullable=False)
    # Routing mode (Story 4.3, FR-11/FR-16) — "review" default so no card
    # silently assumes an always-personal-list destination (AC #4).
    routing_mode: Mapped[str] = mapped_column(
        String(16), nullable=False, default="review", server_default="review"
    )
    fixed_list_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lists.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    owner: Mapped[UserModel] = relationship(back_populates="cards")


class ImportSessionModel(Base):
    """One staged upload (Story 4.6, AD-4). discarded_at is a soft-delete
    timestamp, never a row delete — "discard drops only uncommitted state,
    no ledger writes" (AC #4) stays auditable."""

    __tablename__ = "import_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    discarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[UserModel] = relationship(back_populates="import_sessions")
    statements: Mapped[list[ImportStatementModel]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class ImportStatementModel(Base):
    """One detected statement within an Import Session (Story 4.6, AC #2/#3).

    product_id is a String adapter id (e.g. "bac_credit") — a different
    type than the speculative UUID ledger_entries.product_id from Story 3.2;
    see this story's Completion Notes for the forward note to Story 4.9.

    iban is the normalized statement-level IBAN extracted from the PDF header
    (Story 4.8.1); nullable for backward compatibility with pre-IBAN uploads.
    """

    __tablename__ = "import_statements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("import_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[str] = mapped_column(String(64), nullable=False)
    pdf_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    iban: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    card_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("cards.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )  # Story 4.8.3: identified at upload time
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped[ImportSessionModel] = relationship(back_populates="statements")
    candidate_rows: Mapped[list[ImportCandidateRowModel]] = relationship(
        back_populates="statement",
        cascade="all, delete-orphan",
        order_by="ImportCandidateRowModel.sequence",
    )


class ImportCandidateRowModel(Base):
    """One parsed CanonicalLine plus session review fields (Story 4.10, AD-16).

    product_id is not duplicated here — identical to the parent statement's
    product_id, read from there when needed. Review status/sequence/resolution
    live here, not on CanonicalLine. There is no resolved_ledger_entry_id —
    the link is the reverse FK on ledger_entries.import_candidate_row_id.
    """

    __tablename__ = "import_candidate_rows"
    __table_args__ = (
        UniqueConstraint(
            "statement_id", "sequence", name="uq_import_candidate_rows_statement_sequence"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    statement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("import_statements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    posted_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 4), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    line_type: Mapped[str] = mapped_column(String(32), nullable=False)
    normalized_description: Mapped[str] = mapped_column(Text, nullable=False)
    external_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ref_quality: Mapped[str | None] = mapped_column(String(16), nullable=True)
    provenance: Mapped[str] = mapped_column(String(16), nullable=False, server_default="parser")
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="pending")
    resolved_list_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("lists.id", ondelete="SET NULL"),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    statement: Mapped[ImportStatementModel] = relationship(back_populates="candidate_rows")


class ImportBatchModel(Base):
    """One committed Import Batch (Story 4.10, amended AD-4) — one commit action.

    Under bulk review a commit action covers a whole statement; under
    row-level individual review it covers a single candidate row, so one
    statement may produce many batches. `statement_id` is a non-unique FK.
    Double-commit protection lives on `ledger_entries.import_candidate_row_id`.
    """

    __tablename__ = "import_batches"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("import_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    statement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("import_statements.id", ondelete="CASCADE"),
        nullable=False,
    )
    list_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
