from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column


class ConversationThreadOrm(EntityMixin, Base):
    __tablename__ = "conversation_threads"

    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id"))
    organization_id: Mapped[UUID]
    root_message_id: Mapped[UUID] = mapped_column(ForeignKey("messages.id"))
    title: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_by: Mapped[UUID]