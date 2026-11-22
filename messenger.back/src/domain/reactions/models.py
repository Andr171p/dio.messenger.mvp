from dataclasses import dataclass
from uuid import UUID

from ddf.domain.models import AggregateRoot

from .events import ReactionAdded, ReactionRemoved


@dataclass(kw_only=True)
class MessageReaction(AggregateRoot):
    """Одна реакция actor×emoji на сообщение."""

    message_id: UUID
    conversation_id: UUID
    organization_id: UUID
    actor_id: UUID
    emoji: str
    message_created_seq: int

    def mark_added(self, *, event_seq: int) -> None:
        self.register_event(
            ReactionAdded(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                message_id=self.message_id,
                created_seq=self.message_created_seq,
                event_seq=event_seq,
                actor_id=self.actor_id,
                emoji=self.emoji,
            )
        )

    def mark_removed(self, *, event_seq: int) -> None:
        self.register_event(
            ReactionRemoved(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                message_id=self.message_id,
                created_seq=self.message_created_seq,
                event_seq=event_seq,
                actor_id=self.actor_id,
                emoji=self.emoji,
            )
        )
