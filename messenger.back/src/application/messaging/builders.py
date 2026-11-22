from src.application.messaging.dtos import ConversationEventDTO, MessageDTO
from src.domain.events import ConversationEvent
from src.domain.messages import Message


def build_message_dto(message: Message, *, event_seq: int | None = None) -> MessageDTO:
    # event_seq не всегда равен created_seq (для edit/delete later) — явный маппинг нужен.
    return MessageDTO(
        id=message.id,
        conversation_id=message.conversation_id,
        client_message_id=message.client_message_id,
        sender_id=message.sender_id,
        created_seq=message.created_seq,
        event_seq=event_seq if event_seq is not None else message.created_seq,
        revision=message.revision,
        content=message.content,
        reply_to_id=message.reply_to_id,
        thread_id=message.thread_id,
        created_at=message.created_at,
        edited_at=message.edited_at,
        deleted_at=message.deleted_at,
    )


def build_conversation_event_dto(event: ConversationEvent) -> ConversationEventDTO:
    return ConversationEventDTO.model_validate(event, from_attributes=True)
