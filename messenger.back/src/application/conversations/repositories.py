from typing import Protocol

from uuid import UUID

from src.domain.conversations import Conversation
from src.domain.memberships import ConversationMembership


class ConversationRepository(Protocol):
    async def create(self, entity: Conversation) -> Conversation: ...

    async def read(self, uid: UUID, *, with_lock: bool = False) -> Conversation | None: ...

    async def update(self, entity: Conversation) -> None: ...

    async def list_for_principal(
        self,
        *,
        organization_id: UUID,
        principal_id: UUID,
    ) -> list[Conversation]: ...

    async def find_direct_between(
        self,
        *,
        organization_id: UUID,
        principal_a: UUID,
        principal_b: UUID,
    ) -> Conversation | None: ...

    async def allocate_event_seq(self, conversation_id: UUID) -> int: ...


class MembershipRepository(Protocol):
    async def create(self, entity: ConversationMembership) -> ConversationMembership: ...

    async def get_active(
        self,
        *,
        conversation_id: UUID,
        principal_id: UUID,
    ) -> ConversationMembership | None: ...

    async def find_member(self, conversation_id: UUID, principal_id: UUID) -> ConversationMembership | None: ...

    async def list_active(self, conversation_id: UUID) -> list[ConversationMembership]: ...

    async def has_role(
        self,
        conversation_id: UUID,
        *,
        role: MemberRole,
    ) -> bool: ...

    async def update_read_cursor(
        self,
        *,
        conversation_id: UUID,
        principal_id: UUID,
        last_read_message_seq: int,
    ) -> None: ...

    async def update_delivery_cursor(
        self,
        *,
        conversation_id: UUID,
        principal_id: UUID,
        last_delivered_message_seq: int,
    ) -> None: ...

    async def update(self, entity: ConversationMembership) -> None: ...
