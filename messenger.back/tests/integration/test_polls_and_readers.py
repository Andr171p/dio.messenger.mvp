from uuid import uuid4

import pytest
from ddf.infra.outbox.sqlalchemy import SqlAlchemyOutboxStore

from src.application.auth import Auth, AuthType, AuthUser
from src.application.auth.exceptions import PermissionDeniedError
from src.application.messaging.queries import get_message_readers
from src.application.polls.commands import create_poll_message, vote_poll
from src.application.polls.dtos import CreatePollDTO, VotePollDTO
from src.infra.database.repositories.conversations import SqlAlchemyConversationRepository, SqlAlchemyMembershipRepository
from src.infra.database.repositories.media import SqlAlchemyMediaRepository
from src.infra.database.repositories.messages import SqlAlchemyConversationEventStore, SqlAlchemyMessageRepository
from src.infra.database.repositories.polls import SqlAlchemyPollRepository

from .helpers import seed_conversation, seed_membership


@pytest.mark.integration
async def test_poll_vote_replay_and_reader_permissions(db_session) -> None:
    conversation = await seed_conversation(db_session)
    author_id, reader_id = conversation.created_by, uuid4()
    await seed_membership(db_session, conversation=conversation, principal_id=author_id)
    await seed_membership(db_session, conversation=conversation, principal_id=reader_id)

    def actor(user_id):
        return AuthUser(
            id=user_id, type=AuthType.USER,
            user=Auth.User(id=user_id, email="demo@example.org", organization_id=conversation.organization_id),
        )

    memberships = SqlAlchemyMembershipRepository(db_session)
    messages = SqlAlchemyMessageRepository(db_session)
    repositories = dict(
        conversation_repository=SqlAlchemyConversationRepository(db_session),
        membership_repository=memberships,
        message_repository=messages,
    )
    writes = dict(
        **repositories,
        conversation_id=conversation.id,
        poll_repository=SqlAlchemyPollRepository(db_session),
        event_store=SqlAlchemyConversationEventStore(db_session),
        outbox_store=SqlAlchemyOutboxStore(db_session),
        uow=db_session,
    )
    poll = await create_poll_message(
        CreatePollDTO(client_message_id=uuid4(), question="When?", options=["A", "B"],
                      allows_multiple=True, show_voters=False),
        actor=actor(author_id), media_repository=SqlAlchemyMediaRepository(db_session),
        thread_repository=None, **writes,
    )
    option_a, option_b = [option.id for option in poll.options]
    original = VotePollDTO(option_ids=[option_a, option_b], operation_id=uuid4())
    current = VotePollDTO(option_ids=[option_b], operation_id=uuid4())
    first = await vote_poll(original, poll_id=poll.id, actor=actor(reader_id), **writes)
    assert first.total_voters == 1
    await vote_poll(current, poll_id=poll.id, actor=actor(reader_id), **writes)
    replay = await vote_poll(original, poll_id=poll.id, actor=actor(reader_id), **writes)
    assert replay.my_option_ids == [option_b]
    assert [option.vote_count for option in replay.options] == [0, 1]
    assert not replay.show_voters

    message = await messages.read(poll.message_id)
    assert message is not None
    await memberships.update_read_cursor(
        conversation_id=conversation.id, principal_id=reader_id, last_read_message_seq=message.created_seq,
    )
    await db_session.commit()
    readers = await get_message_readers(
        conversation.id, message.id, actor=actor(author_id), offset=0, limit=10, **repositories,
    )
    assert readers.eligible_count == readers.read_count == 1
    assert readers.readers[0].user_id == reader_id
    assert readers.readers[0].read_at is not None
    with pytest.raises(PermissionDeniedError):
        await get_message_readers(
            conversation.id, message.id, actor=actor(reader_id), offset=0, limit=10, **repositories,
        )
