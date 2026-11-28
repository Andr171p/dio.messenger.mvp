from datetime import datetime
from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class MessagePinOrm(EntityMixin, Base):
    __tablename__ = "message_pins"

    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id"))
    message_id: Mapped[UUID] = mapped_column(ForeignKey("messages.id"))
    organization_id: Mapped[UUID]
    pinned_by: Mapped[UUID]
    pinned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "message_id",
            name="uq_message_pins_conversation_message",
        ),
    )
