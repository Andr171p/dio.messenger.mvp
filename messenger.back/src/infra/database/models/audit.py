from typing import Any
from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column


class AuditEventOrm(EntityMixin, Base):
    __tablename__ = "audit_events"

    organization_id: Mapped[UUID]
    actor_id: Mapped[UUID]
    action: Mapped[str] = mapped_column(String(128))
    conversation_id: Mapped[UUID | None] = mapped_column(ForeignKey("conversations.id"), nullable=True)
    resource_type: Mapped[str] = mapped_column(String(64))
    resource_id: Mapped[str] = mapped_column(String(128))
    summary: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)