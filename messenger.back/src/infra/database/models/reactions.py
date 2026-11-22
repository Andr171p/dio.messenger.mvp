from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class MessageReactionOrm(EntityMixin, Base):
    __tablename__ = "message_reactions"

    message_id: Mapped[UUID] = mapped_column(ForeignKey("messages.id"))
    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id"))
    organization_id: Mapped[UUID]
    actor_id: Mapped[UUID]
    emoji: Mapped[str] = mapped_column(String(32))

    __table_args__ = (
        UniqueConstraint(
            "message_id",
            "actor_id",
            "emoji",
            name="uq_message_reactions_message_actor_emoji",
        ),
    )
