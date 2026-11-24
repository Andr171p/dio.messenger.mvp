from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class AddPinDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    message_id: UUID


class PinDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    conversation_id: UUID
    message_id: UUID
    pinned_by: UUID
    pinned_at: datetime
    event_seq: int
    preview: str | None = None
