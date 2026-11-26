from dataclasses import dataclass, field
from datetime import UTC, datetime
from uuid import UUID

from ddf.domain.models import AggregateRoot

from .events import PollClosed, PollCreated, PollVoted
from .exceptions import PollClosedError, PollInvalidError


@dataclass(kw_only=True)
class PollOption:
    poll_id: UUID
    position: int
    label: str
    id: UUID | None = None


@dataclass(kw_only=True)
class Poll(AggregateRoot):
    message_id: UUID
    conversation_id: UUID
    organization_id: UUID
    question: str
    created_by: UUID
    allows_multiple: bool = False
    show_voters: bool = True
    allows_revoting: bool = True
    is_closed: bool = False
    closed_at: datetime | None = None
    closed_by: UUID | None = None
    message_created_seq: int = 0
    options: list[PollOption] = field(default_factory=list)

    def mark_created(self, *, event_seq: int) -> None:
        self.register_event(
            PollCreated(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                poll_id=self.id,
                message_id=self.message_id,
                message_created_seq=self.message_created_seq,
                event_seq=event_seq,
                created_by=self.created_by,
            )
        )

    def ensure_open(self) -> None:
        if self.is_closed:
            raise PollClosedError("Poll is closed.")

    def record_vote(self, *, event_seq: int, voter_id: UUID, option_id: UUID) -> None:
        self.ensure_open()
        if not any(opt.id == option_id for opt in self.options if opt.id is not None):
            raise PollInvalidError("Unknown poll option.")
        self.register_event(
            PollVoted(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                poll_id=self.id,
                message_id=self.message_id,
                message_created_seq=self.message_created_seq,
                event_seq=event_seq,
                voter_id=voter_id,
                option_id=option_id,
            )
        )

    def close(self, *, event_seq: int, closed_by: UUID) -> None:
        if self.is_closed:
            raise PollClosedError("Poll is already closed.")
        self.is_closed = True
        self.closed_by = closed_by
        self.closed_at = datetime.now(UTC)
        self.register_event(
            PollClosed(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                poll_id=self.id,
                message_id=self.message_id,
                message_created_seq=self.message_created_seq,
                event_seq=event_seq,
                closed_by=closed_by,
            )
        )
