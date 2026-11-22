from dataclasses import dataclass
from uuid import UUID

from ddf.domain.models import AggregateRoot

from .events import ThreadCreated


@dataclass(kw_only=True)
class ConversationThread(AggregateRoot):
    """Тред (тема) внутри беседы с корневым сообщением."""

    conversation_id: UUID
    organization_id: UUID
    root_message_id: UUID
    created_by: UUID
    title: str | None = None
    root_message_created_seq: int = 0

    def mark_created(self, *, event_seq: int) -> None:
        self.register_event(
            ThreadCreated(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                thread_id=self.id,
                root_message_id=self.root_message_id,
                event_seq=event_seq,
                created_by=self.created_by,
                title=self.title,
            )
        )