from typing import Any

from uuid import UUID

from .events import MessageCreated
from .models import Message


def create_message(
    *,
    conversation_id: UUID,
    organization_id: UUID,
    sender_id: UUID,
    client_message_id: UUID,
    created_seq: int,
    content: dict[str, Any],
    reply_to_id: UUID | None = None,
    thread_id: UUID | None = None,
) -> Message:
    """Создаёт сообщение и регистрирует durable domain-событие."""

    message = Message(
        conversation_id=conversation_id,
        organization_id=organization_id,
        sender_id=sender_id,
        client_message_id=client_message_id,
        created_seq=created_seq,
        content=content,
        reply_to_id=reply_to_id,
        thread_id=thread_id,
    )
    message.register_event(
        MessageCreated(
            organization_id=organization_id,
            conversation_id=conversation_id,
            message_id=message.id,
            created_seq=created_seq,
            event_seq=created_seq,
            sender_id=sender_id,
            client_message_id=client_message_id,
            thread_id=thread_id,
        )
    )
    return message
