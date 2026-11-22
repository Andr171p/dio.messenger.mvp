from pydantic import Field, NonNegativeFloat, PositiveInt
from pydantic_settings import BaseSettings, SettingsConfigDict


class MediaWorkerConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MEDIA_WORKER_")

    poll_interval: NonNegativeFloat = Field(default=1.0)
    batch_size: PositiveInt = Field(default=10)