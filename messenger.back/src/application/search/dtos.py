from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PositiveInt
from pydantic.alias_generators import to_camel


class SearchMessageHitDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    conversation_id: UUID
    sender_id: UUID
    created_seq: PositiveInt
    created_at: datetime
    snippet: str
    rank: float | None = None


class SearchMessagesResultDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    items: list[SearchMessageHitDTO]
    limit: PositiveInt


class MessageSearchCriteria(BaseModel):
    model_config = ConfigDict(frozen=True)

    organization_id: UUID
    principal_id: UUID
    conversation_id: UUID | None = None
    history_from_seq: int | None = None
    author_id: UUID | None = None
    from_at: datetime | None = None
    to_at: datetime | None = None
    query: str | None = None
    has_attachment: bool | None = None
    resource_provider: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    limit: int = Field(default=20, ge=1, le=50)