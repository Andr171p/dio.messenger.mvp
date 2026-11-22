from typing import Protocol
from uuid import UUID

from src.domain.policies import ConversationPolicy


class ConversationPolicyRepository(Protocol):
    async def get_for_conversation(self, conversation_id: UUID) -> ConversationPolicy | None: ...

    async def upsert(self, entity: ConversationPolicy) -> ConversationPolicy: ...
