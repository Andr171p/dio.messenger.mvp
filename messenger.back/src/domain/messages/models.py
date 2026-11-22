from typing import Any

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from ddf.domain.models import AggregateRoot

from .events import MessageDeleted, MessageEdited
from .exceptions import MessageAlreadyDeletedError


@dataclass(kw_only=True)
class Message(AggregateRoot):
    """Сообщение: содержимое, ревизии, reply, tombstone. Не вложено в Conversation."""

    conversation_id: UUID
    organization_id: UUID
    sender_id: UUID
    client_message_id: UUID
    created_seq: int
    content: dict[str, Any]
    revision: int = 1
    reply_to_id: UUID | None = None
    thread_id: UUID | None = None
    edited_at: datetime | None = None

    @property
    def is_tombstone(self) -> bool:
        return self.is_deleted

    def replace_content(self, content: dict[str, Any], *, event_seq: int) -> None:
        """Заменяет содержимое. Политика окна редактирования — на application-слое."""

        if self.is_tombstone:
            raise MessageAlreadyDeletedError("Deleted message cannot be edited.")

        self.content = content
        self.revision += 1
        self.edited_at = self.updated_at = datetime.now(UTC)
        self.register_event(
            MessageEdited(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                message_id=self.id,
                created_seq=self.created_seq,
                event_seq=event_seq,
                revision=self.revision,
            )
        )

    def soft_delete(self, *, event_seq: int) -> None:
        if self.is_tombstone:
            raise MessageAlreadyDeletedError("Message is already deleted.")

        self.deleted_at = self.updated_at = datetime.now(UTC)
        self.register_event(
            MessageDeleted(
                organization_id=self.organization_id,
                conversation_id=self.conversation_id,
                message_id=self.id,
                created_seq=self.created_seq,
                event_seq=event_seq,
            )
        )
