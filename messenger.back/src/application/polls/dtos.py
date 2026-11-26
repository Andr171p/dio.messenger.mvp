from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, NonNegativeInt, field_validator
from pydantic.alias_generators import to_camel


class PollOptionDetailsDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    link: HttpUrl | None = None
    asset_id: UUID | None = None

    @field_validator("link")
    @classmethod
    def link_without_credentials(cls, link: HttpUrl | None) -> HttpUrl | None:
        if link and (link.username is not None or link.password is not None):
            raise ValueError("Links cannot contain credentials.")
        return link


class AddPollOptionDTO(PollOptionDetailsDTO):
    option_id: UUID
    label: str = Field(min_length=1, max_length=256)


class CreatePollDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    client_message_id: UUID
    question: str = Field(min_length=1, max_length=500)
    options: list[str] = Field(min_length=2, max_length=10)
    description: str | None = Field(default=None, max_length=1000)
    option_details: list[PollOptionDetailsDTO] | None = Field(default=None, max_length=10)
    allows_multiple: bool = False
    show_voters: bool = True
    allows_revoting: bool = True
    thread_id: UUID | None = None


class VotePollDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    option_ids: list[UUID] = Field(min_length=1)
    operation_id: UUID | None = None


class PollOptionDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    position: int
    label: str
    link: HttpUrl | None = None
    asset_id: UUID | None = None
    vote_count: NonNegativeInt = 0


class PollDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    message_id: UUID
    conversation_id: UUID
    question: str
    description: str | None = None
    allows_multiple: bool
    show_voters: bool = True
    allows_revoting: bool = True
    total_voters: NonNegativeInt = 0
    is_closed: bool
    created_by: UUID
    created_at: datetime
    options: list[PollOptionDTO]
    my_option_ids: list[UUID] = Field(default_factory=list)
    event_seq: int
