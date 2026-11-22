from pydantic import BaseModel, Field, NonNegativeFloat, PositiveInt


class ScheduledWorkerConfig(BaseModel):
    poll_interval: NonNegativeFloat = Field(default=1.0)
    batch_size: PositiveInt = Field(default=20)