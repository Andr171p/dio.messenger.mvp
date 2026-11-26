from uuid import UUID
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt
from pydantic.alias_generators import to_camel

from src.domain.conversations import ConversationType
from src.domain.memberships import MemberRole


GroupAvatar = Annotated[str, Field(max_length=65536, pattern=r"^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+=*$")] | None


class UpdateGroupAvatarDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    avatar_url: GroupAvatar


class UpdateGroupDTO(UpdateGroupAvatarDTO):
    title: str = Field(min_length=1, max_length=255, pattern=r"\S")
    description: str | None = Field(default=None, max_length=1024)


class TransferOwnershipDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    principal_id: UUID


class CreateGroupConversationDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True, str_strip_whitespace=True)

    description: str | None = Field(default=None, max_length=1024)
    avatar_url: GroupAvatar = None
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


class ConversationPresenceDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    user_id: UUID
    status: Literal["online", "offline"]


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
    description: str | None = None
    avatar_url: str | None = None
    peer_id: UUID | None = None
    last_event_seq: NonNegativeInt
    created_by: UUID
    has_external_members: bool = False


class InviteCatalogUserDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    email: str
    full_name: str | None = None
    username: str | None = None
    avatar_url: str | None = None
    roles: list[str] = Field(default_factory=list)
    counterparty_id: UUID | None = None
    principal_kind: str
