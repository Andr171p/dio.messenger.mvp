from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt
from pydantic.alias_generators import to_camel

from src.domain.conversations import ConversationType
from src.domain.memberships import MemberRole


class CreateGroupConversationDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    title: str = Field(min_length=1, max_length=255)
    member_ids: list[UUID] = Field(default_factory=list)
    guest_ids: list[UUID] = Field(default_factory=list)


class CreateDirectConversationDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    peer_id: UUID


class AddMemberDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    principal_id: UUID
    role: MemberRole = MemberRole.MEMBER


class ConversationMemberDTO(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        frozen=True,
        from_attributes=True,
    )

    principal_id: UUID
    role: MemberRole
    history_from_seq: NonNegativeInt
    last_read_message_seq: NonNegativeInt
    last_delivered_message_seq: NonNegativeInt


class ConversationDTO(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        frozen=True,
        from_attributes=True,
    )

    id: UUID
    organization_id: UUID
    type: ConversationType
    title: str | None
    last_event_seq: NonNegativeInt
    created_by: UUID
    has_external_members: bool = False


class InviteCatalogUserDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    email: str
    full_name: str | None = None
    username: str | None = None
    roles: list[str] = Field(default_factory=list)
    counterparty_id: UUID | None = None
    principal_kind: str
