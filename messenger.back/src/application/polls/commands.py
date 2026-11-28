from collections import Counter
from uuid import UUID

from ddf.application.exceptions import UniqueConstraintViolationError
from ddf.application.outbox import OutboxStore, save_events_to_outbox
from ddf.application.uow import UnitOfWork

from src.application.auth import AuthUser
from src.application.auth.exceptions import PermissionDeniedError
from src.application.conversations.commands import require_active_membership
from src.application.conversations.repositories import ConversationRepository, MembershipRepository
from src.application.media.repositories import MediaRepository
from src.application.messaging.commands import _ensure_media_attachable
from src.application.messaging.repositories import ConversationEventStore, MessageRepository
from src.application.policies.helpers import assert_attachments_allowed, effective_policy, is_guest_membership
from src.application.policies.repositories import ConversationPolicyRepository
from src.application.polls.content import build_poll_message_content, mark_poll_closed_in_content
from src.application.polls.dtos import AddPollOptionDTO, CreatePollDTO, PollDTO, PollOptionDTO, VotePollDTO
from src.application.polls.exceptions import PollClosedError, PollInvalidError, PollNotFoundError
from src.application.polls.repositories import PollRepository
from src.application.threads.commands import ensure_thread_sendable
from src.application.threads.repositories import ThreadRepository
from src.domain.conversations import Conversation
from src.domain.events import ConversationEvent
from src.domain.media.types import MediaPresentation
from src.domain.memberships import ConversationMembership, MemberRole
from src.domain.messages import Message, create_message
from src.domain.polls import Poll, PollOption, create_poll
from src.domain.polls.events import PollOptionAdded


def _to_poll_dto(
    poll: Poll,
    *,
    event_seq: int,
    vote_counts: dict[UUID, int],
    my_option_ids: list[UUID],
    total_voters: int = 0,
) -> PollDTO:
    return PollDTO(
        id=poll.id,
        message_id=poll.message_id,
        conversation_id=poll.conversation_id,
        question=poll.question,
        description=poll.description,
        allows_multiple=poll.allows_multiple,
        show_voters=poll.show_voters,
        allows_revoting=poll.allows_revoting,
        total_voters=total_voters,
        is_closed=poll.is_closed,
        created_by=poll.created_by,
        created_at=poll.created_at,
        options=[
            PollOptionDTO(
                id=opt.id,  # type: ignore[arg-type]
                position=opt.position,
                label=opt.label,
                link=opt.link,
                asset_id=opt.asset_id,
                vote_count=vote_counts.get(opt.id, 0),  # type: ignore[arg-type]
            )
            for opt in poll.options
            if opt.id is not None
        ],
        my_option_ids=my_option_ids,
        event_seq=event_seq,
    )


async def create_poll_message(  # noqa: C901, PLR0915
    command: CreatePollDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    message_repository: MessageRepository,
    event_store: ConversationEventStore,
    poll_repository: PollRepository,
    media_repository: MediaRepository,
    thread_repository: ThreadRepository | None,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
    policy_repository: ConversationPolicyRepository | None = None,
) -> PollDTO:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    if is_guest_membership(membership):
        raise PermissionDeniedError("Guests cannot create polls.")

    thread_id = command.thread_id
    if thread_id is not None:
        if thread_repository is None:
            raise PollInvalidError("Thread repository unavailable.")
        await ensure_thread_sendable(
            conversation_id=conversation_id,
            thread_id=thread_id,
            membership_history_from_seq=membership.history_from_seq,
            thread_repository=thread_repository,
            message_repository=message_repository,
        )

    poll = create_poll(
        message_id=UUID(int=0),
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        question=command.question,
        option_labels=list(command.options),
        created_by=actor.user.id,
        message_created_seq=0,
        allows_multiple=command.allows_multiple,
    )
    poll.show_voters = command.show_voters
    poll.allows_revoting = command.allows_revoting
    poll.description = (command.description or "").strip() or None
    if command.option_details is not None:
        if len(command.option_details) != len(poll.options):
            raise PollInvalidError("Each option needs a corresponding details entry.")
        for option, details in zip(poll.options, command.option_details, strict=True):
            option.link = str(details.link) if details.link else None
            option.asset_id = details.asset_id
    content = build_poll_message_content(
        question=poll.question,
        poll_id=poll.id,
        allows_multiple=poll.allows_multiple,
    )

    existing_msg = await message_repository.get_by_client_message_id(
        conversation_id=conversation_id,
        sender_id=actor.user.id,
        client_message_id=command.client_message_id,
    )
    if existing_msg is not None:
        existing_poll = await poll_repository.get_by_message(existing_msg.id)
        if existing_poll is None:
            raise PollInvalidError("Idempotent client_message_id conflicts with non-poll message.")
        vote_pairs = await poll_repository.list_votes_for_poll(existing_poll.id)
        counts = Counter(opt_id for opt_id, _ in vote_pairs)
        my_ids = [opt_id for opt_id, voter in vote_pairs if voter == actor.user.id]
        return _to_poll_dto(
            existing_poll,
            event_seq=existing_msg.created_seq,
            vote_counts=dict(counts),
            my_option_ids=my_ids,
            total_voters=len({voter for _, voter in vote_pairs}),
        )

    assets = await _poll_assets(poll.options, actor, conversation, media_repository, policy_repository)
    message_seq = await conversation_repository.allocate_event_seq(conversation.id)
    message = create_message(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        sender_id=actor.user.id,
        client_message_id=command.client_message_id,
        created_seq=message_seq,
        content=content,
        thread_id=thread_id,
    )
    poll.message_id = message.id
    poll.message_created_seq = message_seq

    try:
        await message_repository.create(message)
        poll_seq = await conversation_repository.allocate_event_seq(conversation.id)
        poll.mark_created(event_seq=poll_seq)
        await poll_repository.create(poll)
        if assets:
            await media_repository.link_to_message(message_id=message.id, asset_ids=assets)
        await event_store.append(
            ConversationEvent(
                conversation_id=conversation.id,
                organization_id=conversation.organization_id,
                seq=message_seq,
                type="message.created",
                payload=_message_poll_created_payload(message, command=command, poll=poll, seq=message_seq),
            )
        )
        await event_store.append(
            ConversationEvent(
                conversation_id=conversation.id,
                organization_id=conversation.organization_id,
                seq=poll_seq,
                type="poll.created",
                payload={
                    "pollId": str(poll.id),
                    "messageId": str(message.id),
                    "createdSeq": message_seq,
                    "eventSeq": poll_seq,
                    "createdBy": str(actor.user.id),
                },
            )
        )
        await save_events_to_outbox(outbox_store, message)
        await save_events_to_outbox(outbox_store, poll)
        await uow.commit()
    except UniqueConstraintViolationError:
        await uow.rollback()
        existing_msg = await message_repository.get_by_client_message_id(
            conversation_id=conversation_id,
            sender_id=actor.user.id,
            client_message_id=command.client_message_id,
        )
        if existing_msg is None:
            raise
        existing_poll = await poll_repository.get_by_message(existing_msg.id)
        if existing_poll is None:
            raise
        vote_pairs = await poll_repository.list_votes_for_poll(existing_poll.id)
        counts = Counter(opt_id for opt_id, _ in vote_pairs)
        my_ids = [opt_id for opt_id, voter in vote_pairs if voter == actor.user.id]
        return _to_poll_dto(
            existing_poll,
            event_seq=existing_msg.created_seq,
            vote_counts=dict(counts),
            my_option_ids=my_ids,
            total_voters=len({voter for _, voter in vote_pairs}),
        )

    return _to_poll_dto(
        poll,
        event_seq=poll_seq,
        vote_counts={},
        my_option_ids=[],
    )


async def _poll_assets(
    options: list[PollOption],
    actor: AuthUser,
    conversation: Conversation,
    media_repository: MediaRepository,
    policy_repository: ConversationPolicyRepository | None,
) -> list[UUID]:
    blocks = [(option.asset_id, MediaPresentation.FILE) for option in options if option.asset_id]
    if not blocks:
        return []
    policy = await policy_repository.get_for_conversation(conversation.id) if policy_repository else None
    assert_attachments_allowed(
        effective_policy(
            policy,
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
        )
    )
    return await _ensure_media_attachable(
        blocks=blocks,
        actor=actor,
        organization_id=conversation.organization_id,
        conversation_id=conversation.id,
        media_repository=media_repository,
    )


def _message_poll_created_payload(
    message: Message,
    *,
    command: CreatePollDTO,
    poll: Poll,
    seq: int,
) -> dict:
    payload: dict = {
        "messageId": str(message.id),
        "createdSeq": seq,
        "senderId": str(message.sender_id),
        "clientMessageId": str(command.client_message_id),
        "revision": message.revision,
        "content": message.content,
        "replyToId": None,
        "pollId": str(poll.id),
    }
    if command.thread_id is not None:
        payload["threadId"] = str(command.thread_id)
    return payload


async def get_visible_poll(
    *,
    conversation_id: UUID,
    poll_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    poll_repository: PollRepository,
    message_repository: MessageRepository,
    lock: bool = False,
) -> tuple[Conversation, ConversationMembership, Poll, Message]:
    conversation, membership = await require_active_membership(
        conversation_id=conversation_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
    )
    poll = await poll_repository.read(poll_id, lock=lock)
    if poll is None or poll.conversation_id != conversation_id:
        raise PollNotFoundError("Poll not found.")
    message = await message_repository.read(poll.message_id)
    if message is None or message.deleted_at is not None or message.created_seq < membership.history_from_seq:
        raise PollNotFoundError("Poll not found.")
    return conversation, membership, poll, message


async def poll_state(
    poll: Poll,
    *,
    event_seq: int,
    voter_id: UUID,
    poll_repository: PollRepository,
) -> PollDTO:
    votes = await poll_repository.list_votes_for_poll(poll.id)
    return _to_poll_dto(
        poll,
        event_seq=event_seq,
        vote_counts=dict(Counter(option for option, _ in votes)),
        my_option_ids=[option for option, voter in votes if voter == voter_id],
        total_voters=len({voter for _, voter in votes}),
    )


async def append_poll_option(
    command: AddPollOptionDTO,
    *,
    conversation_id: UUID,
    poll_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    poll_repository: PollRepository,
    message_repository: MessageRepository,
    event_store: ConversationEventStore,
    media_repository: MediaRepository,
    policy_repository: ConversationPolicyRepository,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
) -> PollDTO:
    conversation, _, poll, message = await get_visible_poll(
        conversation_id=conversation_id,
        poll_id=poll_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        poll_repository=poll_repository,
        message_repository=message_repository,
        lock=True,
    )
    if poll.created_by != actor.user.id:
        raise PermissionDeniedError("Only the creator can add poll options.")
    if any(option.id == command.option_id for option in poll.options):
        return await poll_state(
            poll,
            event_seq=conversation.last_event_seq,
            voter_id=actor.user.id,
            poll_repository=poll_repository,
        )
    poll.ensure_open()
    label = command.label.strip()
    if not label or any(option.label.casefold() == label.casefold() for option in poll.options):
        raise PollInvalidError("Enter a distinct option label.")
    max_options = 10
    if len(poll.options) >= max_options:
        raise PollInvalidError("A poll can contain at most 10 options.")
    option = PollOption(
        id=command.option_id,
        poll_id=poll.id,
        label=label,
        position=len(poll.options),
        link=str(command.link) if command.link else None,
        asset_id=command.asset_id,
    )
    assets = await _poll_assets([option], actor, conversation, media_repository, policy_repository)
    await poll_repository.add_option(option)
    if assets and not any(existing.asset_id == option.asset_id for existing in poll.options):
        await media_repository.link_to_message(
            message_id=message.id,
            asset_ids=assets,
            start_position=option.position,
        )
    poll.options.append(option)
    seq = await conversation_repository.allocate_event_seq(conversation.id)
    poll.register_event(
        PollOptionAdded(
            organization_id=conversation.organization_id,
            conversation_id=conversation.id,
            poll_id=poll.id,
            message_id=message.id,
            message_created_seq=message.created_seq,
            event_seq=seq,
            created_by=actor.user.id,
        )
    )
    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="poll.option_added",
            payload={
                "pollId": str(poll.id),
                "messageId": str(message.id),
                "createdSeq": message.created_seq,
                "eventSeq": seq,
            },
        )
    )
    await save_events_to_outbox(outbox_store, poll)
    state = await poll_state(poll, event_seq=seq, voter_id=actor.user.id, poll_repository=poll_repository)
    await uow.commit()
    return state


async def vote_poll(
    command: VotePollDTO,
    *,
    conversation_id: UUID,
    poll_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    poll_repository: PollRepository,
    message_repository: MessageRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
) -> PollDTO:
    conversation, _, poll, message = await get_visible_poll(
        conversation_id=conversation_id,
        poll_id=poll_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        poll_repository=poll_repository,
        message_repository=message_repository,
        lock=True,
    )
    current = await poll_state(
        poll,
        event_seq=conversation.last_event_seq,
        voter_id=actor.user.id,
        poll_repository=poll_repository,
    )
    if command.operation_id and await poll_repository.has_vote_operation(
        poll.id, actor.user.id, command.operation_id
    ):
        return current
    if poll.is_closed:
        raise PollClosedError("Poll is closed.")

    option_ids = list(dict.fromkeys(command.option_ids))
    valid_option_ids = {opt.id for opt in poll.options if opt.id is not None}
    if not all(opt_id in valid_option_ids for opt_id in option_ids):
        raise PollInvalidError("Unknown poll option.")
    if not poll.allows_multiple and len(option_ids) != 1:
        raise PollInvalidError("Poll allows only one option.")

    if set(option_ids) == set(current.my_option_ids):
        if command.operation_id:
            await poll_repository.record_vote_operation(poll.id, actor.user.id, command.operation_id)
            await uow.commit()
        return current
    if current.my_option_ids and not poll.allows_revoting:
        raise PollInvalidError("Changing a vote is disabled.")
    if command.operation_id:
        await poll_repository.record_vote_operation(poll.id, actor.user.id, command.operation_id)
    await poll_repository.remove_votes_for_voter(poll_id=poll.id, voter_id=actor.user.id)
    for option_id in option_ids:
        await poll_repository.add_vote(poll_id=poll.id, option_id=option_id, voter_id=actor.user.id)
    seq = await conversation_repository.allocate_event_seq(conversation.id)
    poll.message_created_seq = message.created_seq
    poll.record_vote(event_seq=seq, voter_id=actor.user.id, option_id=option_ids[0])
    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="poll.voted",
            payload={
                "pollId": str(poll.id),
                "messageId": str(poll.message_id),
                "createdSeq": message.created_seq,
                "eventSeq": seq,
            },
        )
    )
    await save_events_to_outbox(outbox_store, poll)
    result = await poll_state(poll, event_seq=seq, voter_id=actor.user.id, poll_repository=poll_repository)
    await uow.commit()
    return result


async def close_poll(
    *,
    conversation_id: UUID,
    poll_id: UUID,
    actor: AuthUser,
    conversation_repository: ConversationRepository,
    membership_repository: MembershipRepository,
    poll_repository: PollRepository,
    message_repository: MessageRepository,
    event_store: ConversationEventStore,
    outbox_store: OutboxStore,
    uow: UnitOfWork,
) -> PollDTO:
    conversation, membership, poll, message = await get_visible_poll(
        conversation_id=conversation_id,
        poll_id=poll_id,
        actor=actor,
        conversation_repository=conversation_repository,
        membership_repository=membership_repository,
        poll_repository=poll_repository,
        message_repository=message_repository,
        lock=True,
    )

    is_admin = membership.role in (MemberRole.OWNER, MemberRole.ADMIN)
    if poll.created_by != actor.user.id and not is_admin:
        raise PermissionDeniedError("Only poll creator or conversation admin can close the poll.")

    if poll.is_closed:
        return await poll_state(
            poll,
            event_seq=conversation.last_event_seq,
            voter_id=actor.user.id,
            poll_repository=poll_repository,
        )

    seq = await conversation_repository.allocate_event_seq(conversation.id)
    poll.message_created_seq = message.created_seq
    poll.close(event_seq=seq, closed_by=actor.user.id)

    message.content = mark_poll_closed_in_content(message.content)
    await message_repository.update(message)
    await poll_repository.update(poll)

    await event_store.append(
        ConversationEvent(
            conversation_id=conversation.id,
            organization_id=conversation.organization_id,
            seq=seq,
            type="poll.closed",
            payload={
                "pollId": str(poll.id),
                "messageId": str(poll.message_id),
                "createdSeq": message.created_seq,
                "eventSeq": seq,
                "closedBy": str(actor.user.id),
            },
        )
    )
    await save_events_to_outbox(outbox_store, poll)
    await uow.commit()

    return await poll_state(poll, event_seq=seq, voter_id=actor.user.id, poll_repository=poll_repository)
