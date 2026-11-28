from uuid import UUID

from .models import ConversationThread


def create_thread(
    *,
    conversation_id: UUID,
    organization_id: UUID,
    root_message_id: UUID | None,
    created_by: UUID,
    root_message_created_seq: int,
    title: str | None = None,
) -> ConversationThread:
    normalized = title.strip() if title else None
    if normalized == "":
        normalized = None
    return ConversationThread(
        conversation_id=conversation_id,
        organization_id=organization_id,
        root_message_id=root_message_id,
        created_by=created_by,
        title=normalized,
        root_message_created_seq=root_message_created_seq,
    )
