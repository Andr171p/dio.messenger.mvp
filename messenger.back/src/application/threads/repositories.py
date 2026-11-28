from typing import Protocol

from uuid import UUID

from src.domain.threads import ConversationThread


class ThreadRepository(Protocol):
    async def create(self, entity: ConversationThread) -> ConversationThread: ...

    async def read(self, thread_id: UUID) -> ConversationThread | None: ...

    async def update(self, entity: ConversationThread) -> bool: ...

    async def get_by_root(
        self,
        *,
        conversation_id: UUID,
        root_message_id: UUID,
    ) -> ConversationThread | None: ...

    async def list_for_conversation(
        self,
        conversation_id: UUID,
        *,
        history_from_seq: int,
    ) -> list[ConversationThread]: ...
