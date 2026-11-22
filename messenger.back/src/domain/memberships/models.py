from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from ddf.domain.models import AggregateRoot

from .events import MemberJoined, MemberRemoved
from .types import MemberRole


@dataclass(kw_only=True)
class ConversationMembership(AggregateRoot):
    """Участие principal в беседе; индивидуальные cursors и visibility истории."""

    conversation_id: UUID
    organization_id: UUID
    principal_id: UUID
    role: MemberRole
    joined_at: datetime
    left_at: datetime | None = None
    last_read_message_seq: int = 0
    last_delivered_message_seq: int = 0
    history_from_seq: int = 1

    @property
    def is_active(self) -> bool:
        return self.left_at is None and not self.is_deleted

    def register_joined(self, *, event_seq: int) -> None:
        self.register_event(
            MemberJoined(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                principal_id=self.principal_id,
                event_seq=event_seq,
                history_from_seq=self.history_from_seq,
            )
        )

    def register_removed(self, *, event_seq: int, removed_by_id: UUID) -> None:
        self.register_event(
            MemberRemoved(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                principal_id=self.principal_id,
                event_seq=event_seq,
                removed_by_id=removed_by_id,
            )
        )
