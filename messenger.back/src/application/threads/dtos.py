from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CreateThreadDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    root_message_id: UUID | None = None
    title: str | None = Field(default=None, max_length=256)


class RenameThreadDTO(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, frozen=True)

    title: str = Field(min_length=1, max_length=256)


class ThreadDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    conversation_id: UUID
    root_message_id: UUID | None
    title: str | None
    created_by: UUID
    created_at: datetime
    event_seq: int