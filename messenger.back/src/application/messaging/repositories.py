from typing import Protocol

from uuid import UUID

from src.domain.events import ConversationEvent
from src.domain.messages import Message


class MessageRepository(Protocol):
    async def create(self, entity: Message) -> Message: ...

    async def read(self, uid: UUID) -> Message | None: ...

    async def update(self, entity: Message) -> None: ...

    async def get_by_client_message_id(
        self,
        *,
        conversation_id: UUID,
        sender_id: UUID,
        client_message_id: UUID,
    ) -> Message | None: ...

    async def get_history(
        self,
        *,
        conversation_id: UUID,
        before_seq: int | None,
        history_from_seq: int,
        limit: int,
    ) -> list[Message]: ...


class ConversationEventStore(Protocol):
    async def append(self, event: ConversationEvent) -> None: ...

    async def get_after(
        self,
        *,
        conversation_id: UUID,
        after_seq: int,
        history_from_seq: int,
        limit: int,
        min_retained_seq: int | None = None,
    ) -> list[ConversationEvent]: ...

    async def min_seq(self, conversation_id: UUID) -> int | None: ...
