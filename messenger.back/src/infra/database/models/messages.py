from typing import Any

from datetime import datetime
from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import BigInteger, Computed, DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column


class MessageOrm(EntityMixin, Base):
    __tablename__ = "messages"

    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id"))
    organization_id: Mapped[UUID]
    sender_id: Mapped[UUID]
    client_message_id: Mapped[UUID]
    created_seq: Mapped[int] = mapped_column(BigInteger)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    revision: Mapped[int] = mapped_column(Integer, default=1)
    reply_to_id: Mapped[UUID | None] = mapped_column(ForeignKey("messages.id"), nullable=True)
    thread_id: Mapped[UUID | None] = mapped_column(ForeignKey("conversation_threads.id"), nullable=True)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    search_text: Mapped[str] = mapped_column(
        Text,
        Computed("messenger_message_search_text(content)", persisted=True),
        nullable=False,
    )
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('russian', messenger_message_search_text(content))", persisted=True),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("conversation_id", "created_seq", name="uq_messages_conversation_created_seq"),
        UniqueConstraint(
            "conversation_id",
            "sender_id",
            "client_message_id",
            name="uq_messages_sender_client_message",
        ),
    )


class ConversationEventOrm(Base):
    __tablename__ = "conversation_events"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id"))
    organization_id: Mapped[UUID]
    seq: Mapped[int] = mapped_column(BigInteger)
    type: Mapped[str]
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "seq",
            name="uq_conversation_events_conversation_seq",
        ),
    )
