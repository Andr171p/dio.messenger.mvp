from datetime import datetime
from uuid import UUID

from ddf.infra.database.sqlalchemy import Base, EntityMixin
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column


class PollOrm(EntityMixin, Base):
    __tablename__ = "polls"

    message_id: Mapped[UUID] = mapped_column(ForeignKey("messages.id"), unique=True)
    conversation_id: Mapped[UUID] = mapped_column(ForeignKey("conversations.id"))
    organization_id: Mapped[UUID]
    question: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(String(1000))
    allows_multiple: Mapped[bool] = mapped_column(Boolean, default=False)
    show_voters: Mapped[bool] = mapped_column(Boolean, default=True)
    allows_revoting: Mapped[bool] = mapped_column(Boolean, default=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[UUID]
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by: Mapped[UUID | None] = mapped_column(nullable=True)


class PollOptionOrm(EntityMixin, Base):
    __tablename__ = "poll_options"

    poll_id: Mapped[UUID] = mapped_column(ForeignKey("polls.id"))
    position: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(256))
    link: Mapped[str | None] = mapped_column(String(2083))
    asset_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("media_assets.id", ondelete="SET NULL", name="fk_poll_options_asset")
    )

    __table_args__ = (UniqueConstraint("poll_id", "position", name="uq_poll_options_poll_position"),)


class PollVoteOrm(EntityMixin, Base):
    __tablename__ = "poll_votes"

    poll_id: Mapped[UUID] = mapped_column(ForeignKey("polls.id"))
    option_id: Mapped[UUID] = mapped_column(ForeignKey("poll_options.id"))
    voter_id: Mapped[UUID]

    __table_args__ = (
        UniqueConstraint(
            "poll_id",
            "option_id",
            "voter_id",
            name="uq_poll_votes_poll_option_voter",
        ),
    )


class PollVoteOperationOrm(Base):
    __tablename__ = "poll_vote_operations"

    poll_id: Mapped[UUID] = mapped_column(ForeignKey("polls.id", ondelete="CASCADE"), primary_key=True)
    voter_id: Mapped[UUID] = mapped_column(primary_key=True)
    operation_id: Mapped[UUID] = mapped_column(primary_key=True)
