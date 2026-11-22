from uuid import UUID

from pydantic import BaseModel, ConfigDict, NonNegativeInt, PositiveInt
from pydantic.alias_generators import to_camel

from src.application.messaging.dtos import MessageDTO
from src.domain.conversations import ConversationType


class SyncManifestEntryDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    conversation_id: UUID
    last_event_seq: NonNegativeInt
    history_from_seq: NonNegativeInt
    last_read_message_seq: NonNegativeInt
    last_delivered_message_seq: NonNegativeInt


class SyncManifestDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    conversations: list[SyncManifestEntryDTO]


class SnapshotMembershipDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    history_from_seq: NonNegativeInt
    last_read_message_seq: NonNegativeInt
    last_delivered_message_seq: NonNegativeInt


class SnapshotConversationDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    organization_id: UUID
    type: ConversationType
    title: str | None
    last_event_seq: NonNegativeInt
    created_by: UUID
    has_external_members: bool = False


class ConversationSnapshotDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    conversation: SnapshotConversationDTO
    membership: SnapshotMembershipDTO
    snapshot_event_seq: NonNegativeInt
    messages: list[MessageDTO]
    messages_truncated: bool
    message_limit: PositiveInt
