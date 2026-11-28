from uuid import uuid4

import pytest
from ddf.infra.outbox.sqlalchemy import SqlAlchemyOutboxStore

from src.application.auth import Auth, AuthType, AuthUser
from src.application.messaging.commands import send_message
from src.application.messaging.dtos import SendMessageDTO, TextBlock
from src.application.messaging.exceptions import IdempotencyConflictError, MessageNotFoundError
from src.application.messaging.queries import get_events, get_history
from src.infra.database.repositories.audit import SqlAlchemyAuditRepository
from src.infra.database.repositories.conversations import (
    SqlAlchemyConversationRepository,
    SqlAlchemyMembershipRepository,
)
from src.infra.database.repositories.media import SqlAlchemyMediaRepository
from src.infra.database.repositories.messages import (
    SqlAlchemyConversationEventStore,
    SqlAlchemyMessageRepository,
)
from src.infra.database.repositories.policies import SqlAlchemyConversationPolicyRepository

from .helpers import seed_conversation, seed_membership, seed_message

pytestmark = pytest.mark.integration


async def test_quote_survives_storage_history_and_retry(db_session) -> None:
    conversation = await seed_conversation(db_session)
    sender_id = uuid4()
    await seed_membership(db_session, conversation=conversation, principal_id=sender_id, history_from_seq=2)
    await seed_membership(db_session, conversation=conversation, principal_id=conversation.created_by)
    hidden = await seed_message(
        db_session,
        conversation=conversation,
        sender_id=conversation.created_by,
        created_seq=1,
        text="VPN credentials",
    )
    original = await seed_message(
        db_session,
        conversation=conversation,
        sender_id=conversation.created_by,
        created_seq=2,
        text="Check **VPN** access first.",
    )
    actor = AuthUser(
        id=sender_id,
        type=AuthType.USER,
        user=Auth.User(
            id=sender_id, email="sender@example.org", organization_id=conversation.organization_id
        ),
    )
    reader = AuthUser(
        id=conversation.created_by,
        type=AuthType.USER,
        user=Auth.User(
            id=conversation.created_by,
            email="reader@example.org",
            organization_id=conversation.organization_id,
        ),
    )
    repositories = {
        "conversation_repository": SqlAlchemyConversationRepository(db_session),
        "membership_repository": SqlAlchemyMembershipRepository(db_session),
        "message_repository": SqlAlchemyMessageRepository(db_session),
    }
    events = SqlAlchemyConversationEventStore(db_session)
    send_dependencies = dict(
        **repositories,
        conversation_id=conversation.id,
        actor=actor,
        event_store=events,
        media_repository=SqlAlchemyMediaRepository(db_session),
        policy_repository=SqlAlchemyConversationPolicyRepository(db_session),
        outbox_store=SqlAlchemyOutboxStore(db_session),
        audit_repository=SqlAlchemyAuditRepository(db_session),
        uow=db_session,
    )
    request = SendMessageDTO(
        client_message_id=uuid4(),
        reply_to_id=original,
        quote_text="VPN access",
        blocks=[TextBlock(text="Confirmed.")],
    )
    with pytest.raises(MessageNotFoundError):
        await send_message(request.model_copy(update={"reply_to_id": hidden}), **send_dependencies)

    response = await send_message(request, **send_dependencies)
    retry = await send_message(request, **send_dependencies)
    assert retry.id == response.id
    with pytest.raises(IdempotencyConflictError):
        await send_message(request.model_copy(update={"quote_text": "access"}), **send_dependencies)

    history = await get_history(conversation.id, actor=reader, **repositories)
    assert history[-1].reply_to_id == original
    assert history[-1].content["quoteText"] == "VPN access"
    event = (
        await get_events(
            conversation.id,
            actor=reader,
            after_seq=response.created_seq - 1,
            limit=1,
            conversation_repository=repositories["conversation_repository"],
            membership_repository=repositories["membership_repository"],
            event_store=events,
        )
    )[0]
    assert event.payload["content"]["quoteText"] == "VPN access"
    target = await get_history(conversation.id, actor=reader, around_message_id=original, **repositories)
    assert target[-1].id == original
