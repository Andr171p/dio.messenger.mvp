from datetime import datetime
from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import BigInteger, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class ConversationOrm(EntityMixin, Base):
    __tablename__ = "conversations"

    organization_id: Mapped[UUID]
    type: Mapped[str] = mapped_column(String(32))
    title: Mapped[str | None] = mapped_column(String(255))
    created_by: Mapped[UUID]
    last_event_seq: Mapped[int] = mapped_column(BigInteger, default=0)


class ConversationMemberOrm(EntityMixin, Base):
    __tablename__ = "conversation_members"

    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id"))
    organization_id: Mapped[UUID]
    principal_id: Mapped[UUID]
    role: Mapped[str] = mapped_column(String(32))
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    left_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_read_message_seq: Mapped[int] = mapped_column(BigInteger, default=0)
    last_delivered_message_seq: Mapped[int] = mapped_column(BigInteger, default=0)
    history_from_seq: Mapped[int] = mapped_column(BigInteger, default=1)

    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "principal_id",
            name="uq_conversation_members_conversation_principal",
        ),
    )
