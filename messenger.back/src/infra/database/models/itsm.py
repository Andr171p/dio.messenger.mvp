from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class ContextLinkOrm(EntityMixin, Base):
    __tablename__ = "context_links"

    organization_id: Mapped[UUID]
    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id"))
    provider: Mapped[str] = mapped_column(String(64))
    resource_type: Mapped[str] = mapped_column(String(64))
    resource_id: Mapped[str] = mapped_column(String(128))
    created_by: Mapped[UUID]

    __table_args__ = (
        UniqueConstraint("conversation_id", name="uq_context_links_conversation"),
        UniqueConstraint(
            "organization_id",
            "provider",
            "resource_type",
            "resource_id",
            name="uq_context_links_resource",
        ),
    )
