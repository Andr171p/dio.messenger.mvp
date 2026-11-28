from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from ddf.domain.models import AggregateRoot

from .events import MessagePinned, MessageUnpinned


@dataclass(kw_only=True)
class MessagePin(AggregateRoot):
    """Закреплённое сообщение в беседе."""

    conversation_id: UUID
    organization_id: UUID
    message_id: UUID
    pinned_by: UUID
    pinned_at: datetime
    message_created_seq: int

    def mark_pinned(self, *, event_seq: int) -> None:
        self.register_event(
            MessagePinned(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                message_id=self.message_id,
                created_seq=self.message_created_seq,
                event_seq=event_seq,
                pinned_by_id=self.pinned_by,
            )
        )

    def mark_unpinned(self, *, event_seq: int, unpinned_by_id: UUID) -> None:
        self.register_event(
            MessageUnpinned(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                message_id=self.message_id,
                created_seq=self.message_created_seq,
                event_seq=event_seq,
                unpinned_by_id=unpinned_by_id,
            )
        )
