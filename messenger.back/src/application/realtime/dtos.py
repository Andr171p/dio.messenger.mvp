from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, PositiveInt
from pydantic.alias_generators import to_camel


class WsTicketDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    ticket: str = Field(min_length=1)
    expires_in: PositiveInt
    expires_at: datetime
