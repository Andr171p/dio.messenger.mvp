from typing import Any

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from src.application.messaging.dtos import SendMessageDTO


class CreateScheduledMessageDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    send_at: datetime
    message: SendMessageDTO


class ScheduledMessageDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    conversation_id: UUID
    sender_id: UUID
    send_at: datetime
    status: str
    client_message_id: UUID
    payload: dict[str, Any] = Field(default_factory=dict)
