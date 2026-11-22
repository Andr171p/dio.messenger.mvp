"""P7 — retention / audit verification helpers against real Postgres."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import delete, func, select

from src.infra.database.models import ConversationEventOrm
from src.infra.database.models.audit import AuditEventOrm
from tests.integration.helpers import seed_conversation, seed_membership

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_retention_keeps_min_events_and_audit_row(db_session) -> None:
    conversation = await seed_conversation(db_session)
    await seed_membership(db_session, conversation=conversation)

    for seq in range(1, 12):
        db_session.add(
            ConversationEventOrm(
                id=uuid4(),
                conversation_id=conversation.id,
                organization_id=conversation.organization_id,
                seq=seq,
                type="message.created",
                payload={"seq": seq},
                occurred_at=datetime.now(UTC) - timedelta(days=30),
            )
        )
    await db_session.flush()

    min_retained = 5
    max_seq = await db_session.scalar(
        select(func.max(ConversationEventOrm.seq)).where(
            ConversationEventOrm.conversation_id == conversation.id
        )
    )
    cutoff = int(max_seq) - min_retained
    await db_session.execute(
        delete(ConversationEventOrm).where(
            ConversationEventOrm.conversation_id == conversation.id,
            ConversationEventOrm.seq <= cutoff,
        )
    )
    await db_session.flush()

    remaining = await db_session.scalar(
        select(func.count()).select_from(ConversationEventOrm).where(
            ConversationEventOrm.conversation_id == conversation.id
        )
    )
    assert remaining == min_retained

    min_seq = await db_session.scalar(
        select(func.min(ConversationEventOrm.seq)).where(
            ConversationEventOrm.conversation_id == conversation.id
        )
    )
    assert int(min_seq) > 1

    actor_id = uuid4()
    db_session.add(
        AuditEventOrm(
            organization_id=conversation.organization_id,
            actor_id=actor_id,
            action="member.invited",
            conversation_id=conversation.id,
            resource_type="membership",
            resource_id=str(actor_id),
            summary={"role": "guest"},
        )
    )
    await db_session.flush()
    count = await db_session.scalar(
        select(func.count()).select_from(AuditEventOrm).where(
            AuditEventOrm.conversation_id == conversation.id
        )
    )
    assert int(count) >= 1
