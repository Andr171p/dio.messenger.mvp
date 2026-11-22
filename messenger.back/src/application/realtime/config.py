from pydantic import Field, NonNegativeFloat, PositiveInt
from pydantic_settings import BaseSettings, SettingsConfigDict


class RealtimeEphemeralConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="REALTIME_")

    typing_ttl_seconds: PositiveInt = Field(default=5)
    typing_throttle_seconds: NonNegativeFloat = Field(default=1.0)
    presence_ttl_seconds: PositiveInt = Field(default=60)
