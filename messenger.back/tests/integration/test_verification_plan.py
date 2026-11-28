"""P2 integration coverage: ACL, idempotency, cursors, search (PostgreSQL)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from ddf.application.exceptions import UniqueConstraintViolationError
from sqlalchemy import text, update

from src.application.auth.exceptions import PermissionDeniedError
from src.application.messaging.builders import build_message_dto
from src.application.messaging.content import same_send_fingerprint
from src.application.messaging.dtos import SendMessageDTO, TextBlock
from src.application.messaging.exceptions import IdempotencyConflictError
from src.application.policies.helpers import assert_forwarding_allowed, effective_policy
from src.application.receipts.cursors import monotonic_receipt_cursor
from src.application.search.criteria import build_in_conversation_criteria
from src.domain.media.exceptions import MediaNotReadyError
from src.domain.messages import create_message
from src.infra.database.models import MessageOrm
from src.infra.database.repositories.conversations import SqlAlchemyMembershipRepository
from src.infra.database.repositories.media import SqlAlchemyMediaRepository
from src.infra.database.repositories.messages import SqlAlchemyMessageRepository
from src.infra.database.repositories.policies import SqlAlchemyConversationPolicyRepository
from src.infra.database.repositories.search import SqlAlchemyMessageSearchRepository

from .helpers import (
    seed_conversation,
    seed_membership,
    seed_message,
    seed_pending_media,
    seed_policy,
)

pytestmark = pytest.mark.integration


def _idempotent_or_conflict(existing, command: SendMessageDTO):
    conflicts = (
        existing.reply_to_id != command.reply_to_id
        or existing.thread_id != command.thread_id
        or not same_send_fingerprint(existing.content, command)
    )
    if conflicts:
        raise IdempotencyConflictError("client_message_id was already used with different content")
    return build_message_dto(existing, event_seq=existing.created_seq)


async def test_idempotent_send_and_conflict(db_session) -> None:
    conversation = await seed_conversation(db_session)
    sender_id = uuid4()
    client_id = uuid4()
    message_repo = SqlAlchemyMessageRepository(db_session)

    await seed_message(
        db_session,
        conversation=conversation,
        sender_id=sender_id,
        created_seq=1,
        text="first",
        client_message_id=client_id,
    )

    existing = await message_repo.get_by_client_message_id(
        conversation_id=conversation.id,
        sender_id=sender_id,
        client_message_id=client_id,
    )
    assert existing is not None

    same = SendMessageDTO(client_message_id=client_id, blocks=[TextBlock(text="first")])
    dto = _idempotent_or_conflict(existing, same)
    assert dto.id == existing.id

    different = SendMessageDTO(client_message_id=client_id, blocks=[TextBlock(text="second")])
    with pytest.raises(IdempotencyConflictError, match="different content"):
        _idempotent_or_conflict(existing, different)

    duplicate = create_message(
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
        sender_id=sender_id,
        client_message_id=client_id,
        created_seq=2,
        content={"blocks": [{"type": "text", "text": "dup"}], "mentions": {"all": False, "principalIds": []}},
    )
    with pytest.raises(UniqueConstraintViolationError):
        await message_repo.create(duplicate)


async def test_guest_history_visibility_in_message_repo(db_session) -> None:
    conversation = await seed_conversation(db_session, last_event_seq=5)
    sender_id = uuid4()
    await seed_membership(
        db_session,
        conversation=conversation,
        principal_id=sender_id,
        history_from_seq=3,
    )

    for seq, body in ((1, "before"), (2, "edge"), (3, "visible"), (4, "also visible")):
        await seed_message(
            db_session,
            conversation=conversation,
            sender_id=sender_id,
            created_seq=seq,
            text=body,
        )

    message_repo = SqlAlchemyMessageRepository(db_session)
    visible = await message_repo.get_history(
        conversation_id=conversation.id,
        before_seq=None,
        history_from_seq=3,
        limit=10,
    )
    seqs = [item.created_seq for item in visible]
    assert seqs == [3, 4]


async def test_forward_policy_deny_from_database(db_session) -> None:
    conversation = await seed_conversation(db_session)
    await seed_policy(db_session, conversation=conversation, allow_forwarding=False)

    policy_repo = SqlAlchemyConversationPolicyRepository(db_session)
    stored = await policy_repo.get_for_conversation(conversation.id)
    assert stored is not None
    policy = effective_policy(
        stored,
        conversation_id=conversation.id,
        organization_id=conversation.organization_id,
    )
    with pytest.raises(PermissionDeniedError, match="Forwarding is disabled"):
        assert_forwarding_allowed(policy)


async def test_media_not_ready_access_deny(db_session) -> None:
    conversation = await seed_conversation(db_session)
    owner_id = uuid4()
    pending = await seed_pending_media(db_session, conversation=conversation, owner_id=owner_id)

    media_repo = SqlAlchemyMediaRepository(db_session)
    loaded = await media_repo.read(pending.id)
    assert loaded is not None
    with pytest.raises(MediaNotReadyError, match="not ready"):
        loaded.ensure_attachable(owner_id=owner_id, organization_id=conversation.organization_id)


async def test_delivery_cursor_monotonic_on_membership(db_session) -> None:
    conversation = await seed_conversation(db_session, last_event_seq=100)
    principal_id = uuid4()
    await seed_membership(
        db_session,
        conversation=conversation,
        principal_id=principal_id,
        last_delivered_message_seq=10,
    )
    membership_repo = SqlAlchemyMembershipRepository(db_session)

    next_seq, changed = monotonic_receipt_cursor(10, 25, upper_bound=conversation.last_event_seq)
    assert changed and next_seq == 25
    await membership_repo.update_delivery_cursor(
        conversation_id=conversation.id,
        principal_id=principal_id,
        last_delivered_message_seq=next_seq,
    )
    await db_session.flush()

    membership = await membership_repo.get_active(
        conversation_id=conversation.id,
        principal_id=principal_id,
    )
    assert membership is not None
    assert membership.last_delivered_message_seq == 25

    regress_seq, regress_changed = monotonic_receipt_cursor(25, 20, upper_bound=conversation.last_event_seq)
    assert not regress_changed and regress_seq == 25
    await membership_repo.update_delivery_cursor(
        conversation_id=conversation.id,
        principal_id=principal_id,
        last_delivered_message_seq=regress_seq,
    )
    await db_session.flush()

    membership = await membership_repo.get_active(
        conversation_id=conversation.id,
        principal_id=principal_id,
    )
    assert membership is not None
    assert membership.last_delivered_message_seq == 25

    forward_seq, forward_changed = monotonic_receipt_cursor(25, 40, upper_bound=conversation.last_event_seq)
    assert forward_changed and forward_seq == 40
    await membership_repo.update_delivery_cursor(
        conversation_id=conversation.id,
        principal_id=principal_id,
        last_delivered_message_seq=forward_seq,
    )
    await db_session.flush()

    membership = await membership_repo.get_active(
        conversation_id=conversation.id,
        principal_id=principal_id,
    )
    assert membership is not None
    assert membership.last_delivered_message_seq == 40


async def test_search_acl_respects_history_from_seq(db_session) -> None:
    fts_ready = await db_session.scalar(
        text(
            """
            SELECT 1
            FROM information_schema.columns
            WHERE table_name = 'messages' AND column_name = 'search_vector'
            LIMIT 1
            """
        )
    )
    if fts_ready is None:
        pytest.skip("FTS migration not applied (messages.search_vector missing).")

    conversation = await seed_conversation(db_session, last_event_seq=4)
    sender_id = uuid4()
    viewer_id = uuid4()
    await seed_membership(
        db_session,
        conversation=conversation,
        principal_id=sender_id,
        history_from_seq=1,
    )
    await seed_membership(
        db_session,
        conversation=conversation,
        principal_id=viewer_id,
        history_from_seq=3,
    )

    needle = "IntegrationSearchAclNeedle"
    await seed_message(
        db_session,
        conversation=conversation,
        sender_id=sender_id,
        created_seq=2,
        text=f"{needle} hidden",
    )
    await seed_message(
        db_session,
        conversation=conversation,
        sender_id=sender_id,
        created_seq=3,
        text=f"{needle} visible",
    )

    search_repo = SqlAlchemyMessageSearchRepository(db_session)
    criteria = build_in_conversation_criteria(
        organization_id=conversation.organization_id,
        principal_id=viewer_id,
        conversation_id=conversation.id,
        history_from_seq=3,
        query=needle,
        limit=10,
    )
    hits = await search_repo.search_in_conversation(
        conversation_id=conversation.id,
        criteria=criteria,
    )
    assert len(hits) == 1
    assert hits[0].created_seq == 3


async def test_media_gallery_numbers_only_visible_photos_in_order(db_session) -> None:
    conversation = await seed_conversation(db_session)
    repository = SqlAlchemyMediaRepository(db_session)
    entries = []
    for seq, mime in enumerate(("image/png", "image/png", "video/mp4", "image/png", "image/png"), start=1):
        message_id = await seed_message(
            db_session,
            conversation=conversation,
            sender_id=conversation.created_by,
            created_seq=seq,
            text="Gallery fixture",
        )
        asset = await seed_pending_media(
            db_session, conversation=conversation, owner_id=conversation.created_by
        )
        asset.mark_uploaded(size=64, content_type=mime)
        asset.mark_scanning()
        asset.mark_ready()
        await repository.update(asset)
        await repository.link_to_message(message_id=message_id, asset_ids=[asset.id])
        if seq == 5:
            await db_session.execute(
                update(MessageOrm)
                .where(MessageOrm.id == message_id)
                .values(
                    content={"blocks": [{"type": "media", "assetId": str(asset.id), "presentation": "file"}]},
                )
            )
        entries.append((message_id, asset.id))

    criteria = {"conversation_id": conversation.id, "history_from_seq": 2, "media_kind": "image"}
    hidden_message, hidden_asset = entries[0]
    assert (
        await repository.get_gallery_position(
            **criteria,
            message_id=hidden_message,
            asset_id=hidden_asset,
        )
        is None
    )
    first_message, first_asset = entries[1]
    last_message, last_asset = entries[3]
    first = await repository.get_gallery_position(
        **criteria,
        message_id=first_message,
        asset_id=first_asset,
    )
    assert first is not None and (first.position, first.total) == (1, 2)
    assert first.previous is None and first.next is not None
    assert (first.next.message_id, first.next.asset_id) == (last_message, last_asset)
    assert first.sender_id == conversation.created_by
    last = await repository.get_gallery_position(
        **criteria,
        message_id=last_message,
        asset_id=last_asset,
    )
    assert last is not None and (last.position, last.total) == (2, 2)
    assert last.next is None and last.previous is not None
    assert (last.previous.message_id, last.previous.asset_id) == (first_message, first_asset)
    file_message, file_asset = entries[4]
    assert (
        await repository.get_gallery_position(
            **criteria,
            message_id=file_message,
            asset_id=file_asset,
        )
        is None
    )
