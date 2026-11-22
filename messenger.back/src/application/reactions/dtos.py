from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class AddReactionDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    message_id: UUID
    emoji: str = Field(min_length=1, max_length=32)


class ReactionDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    message_id: UUID
    conversation_id: UUID
    actor_id: UUID
    emoji: str
    event_seq: int
    created_at: datetime


class ReactionSummaryDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    emoji: str
    count: int
    reacted_by_me: bool
