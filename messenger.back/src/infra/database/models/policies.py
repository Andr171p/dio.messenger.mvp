from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column


class ConversationPolicyOrm(EntityMixin, Base):
    __tablename__ = "conversation_policies"

    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id"), unique=True)
    organization_id: Mapped[UUID]
    allow_external_members: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_forwarding: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_attachments: Mapped[bool] = mapped_column(Boolean, default=True)
    allow_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    max_attachment_bytes: Mapped[int] = mapped_column(BigInteger, default=25_000_000)
    message_edit_window_seconds: Mapped[int] = mapped_column(Integer, default=900)
    version: Mapped[int] = mapped_column(Integer, default=1)
