"""Shared seed helpers for PostgreSQL integration tests."""

from __future__ import annotations

from typing import Any

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.conversations import Conversation, ConversationType
from src.domain.media import MediaAsset, MediaObject, MediaObjectRole, MediaStatus, UploadTargetType
from src.domain.memberships import ConversationMembership, MemberRole
from src.domain.messages import create_message
from src.domain.policies import ConversationPolicy
from src.infra.database.repositories.conversations import (
    SqlAlchemyConversationRepository,
    SqlAlchemyMembershipRepository,
)
from src.infra.database.repositories.media import SqlAlchemyMediaRepository
from src.infra.database.repositories.messages import SqlAlchemyMessageRepository
from src.infra.database.repositories.policies import SqlAlchemyConversationPolicyRepository


def text_content(text: str) -> dict[str, Any]:
    return {
        "blocks": [{"type": "text", "text": text}],
        "mentions": {"all": False, "principalIds": []},
    }


async def seed_conversation(
    session: AsyncSession,
    *,
    organization_id: UUID | None = None,
    created_by: UUID | None = None,
    last_event_seq: int = 20,
    title: str = "integration-conversation",
) -> Conversation:
    org_id = organization_id or uuid4()
    owner_id = created_by or uuid4()
    conversation = Conversation(
        organization_id=org_id,
        type=ConversationType.GROUP,
        title=title,
        created_by=owner_id,
        last_event_seq=last_event_seq,
    )
    await SqlAlchemyConversationRepository(session).create(conversation)
    await session.flush()
    return conversation


async def seed_membership(
    session: AsyncSession,
    *,
    conversation: Conversation,
    principal_id: UUID | None = None,
    role: MemberRole = MemberRole.MEMBER,
    history_from_seq: int = 1,
    last_delivered_message_seq: int = 0,
    last_read_message_seq: int = 0,
) -> ConversationMembership:
    membership = ConversationMembership(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        principal_id=principal_id or uuid4(),
        role=role,
        joined_at=datetime.now(UTC),
        history_from_seq=history_from_seq,
        last_delivered_message_seq=last_delivered_message_seq,
        last_read_message_seq=last_read_message_seq,
    )
    await SqlAlchemyMembershipRepository(session).create(membership)
    await session.flush()
    return membership


async def seed_message(
    session: AsyncSession,
    *,
    conversation: Conversation,
    sender_id: UUID,
    created_seq: int,
    text: str,
    client_message_id: UUID | None = None,
) -> UUID:
    message = create_message(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        sender_id=sender_id,
        client_message_id=client_message_id or uuid4(),
        created_seq=created_seq,
        content=text_content(text),
    )
    await SqlAlchemyMessageRepository(session).create(message)
    await session.flush()
    return message.id


async def seed_policy(
    session: AsyncSession,
    *,
    conversation: Conversation,
    allow_forwarding: bool = True,
) -> ConversationPolicy:
    policy = ConversationPolicy(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        allow_forwarding=allow_forwarding,
    )
    await SqlAlchemyConversationPolicyRepository(session).create(policy)
    await session.flush()
    return policy


async def seed_pending_media(
    session: AsyncSession,
    *,
    conversation: Conversation,
    owner_id: UUID,
) -> MediaAsset:
    asset_id = uuid4()
    asset = MediaAsset(
        id=asset_id,
        organization_id=conversation.organization_id,
        owner_id=owner_id,
        filename="pending.png",
        content_type="image/png",
        size=64,
        status=MediaStatus.PENDING,
        target_type=UploadTargetType.MESSAGE,
        conversation_id=conversation.id,
        objects=[
            MediaObject(
                id=uuid4(),
                asset_id=asset_id,
                role=MediaObjectRole.STAGING,
                key="messenger/staging/integration",
                content_type="image/png",
                size=64,
            )
        ],
    )
    await SqlAlchemyMediaRepository(session).create(asset)
    await session.flush()
    return asset
