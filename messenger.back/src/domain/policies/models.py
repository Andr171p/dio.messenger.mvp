from dataclasses import dataclass
from uuid import UUID

from ddf.domain.models import AggregateRoot


@dataclass(kw_only=True)
class ConversationPolicy(AggregateRoot):
    """Overrides политик беседы. Org-level deny не ослабляется (MVP: только conversation)."""

    conversation_id: UUID
    organization_id: UUID
    allow_external_members: bool = False
    allow_forwarding: bool = True
    allow_attachments: bool = True
    allow_ai: bool = False
    max_attachment_bytes: int = 25_000_000
    message_edit_window_seconds: int = 900
    version: int = 1


def default_conversation_policy(
    *,
    conversation_id: UUID,
    organization_id: UUID,
) -> ConversationPolicy:
    return ConversationPolicy(
        conversation_id=conversation_id,
        organization_id=organization_id,
    )
