from typing import Any

from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import BigInteger, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column


class MediaAssetOrm(EntityMixin, Base):
    __tablename__ = "media_assets"

    organization_id: Mapped[UUID]
    owner_id: Mapped[UUID]
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(255))
    size: Mapped[int] = mapped_column(BigInteger)
    status: Mapped[str] = mapped_column(String(32))
    target_type: Mapped[str] = mapped_column(String(64))
    conversation_id: Mapped[UUID]
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class MediaObjectOrm(Base):
    __tablename__ = "media_objects"

    id: Mapped[UUID] = mapped_column(primary_key=True)
    asset_id: Mapped[UUID] = mapped_column(ForeignKey("media_assets.id"))
    role: Mapped[str] = mapped_column(String(32))
    key: Mapped[str] = mapped_column(String(1024))
    content_type: Mapped[str] = mapped_column(String(255))
    size: Mapped[int] = mapped_column(BigInteger)

    __table_args__ = (UniqueConstraint("asset_id", "role", name="uq_media_objects_asset_role"),)


class MessageMediaOrm(Base):
    __tablename__ = "message_media"

    message_id: Mapped[UUID] = mapped_column(ForeignKey("messages.id"), primary_key=True)
    asset_id: Mapped[UUID] = mapped_column(ForeignKey("media_assets.id"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer)

    __table_args__ = (UniqueConstraint("message_id", "position", name="uq_message_media_message_position"),)
