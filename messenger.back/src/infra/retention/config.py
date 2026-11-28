from pydantic import Field, PositiveInt
from pydantic_settings import BaseSettings, SettingsConfigDict


class RetentionConfig(BaseSettings):
    model_config = SettingsConfigDict(populate_by_name=True)

    event_retention_days: PositiveInt = Field(default=90, alias="EVENT_RETENTION_DAYS")
    min_retained_events: PositiveInt = Field(default=1000, alias="MIN_RETAINED_EVENTS")
    message_tombstone_retention_days: PositiveInt = Field(
        default=90,
        alias="MESSAGE_TOMBSTONE_RETENTION_DAYS",
    )


class RetentionWorkerConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="RETENTION_WORKER_")

    poll_interval: PositiveInt = Field(default=3600)
    batch_conversations: PositiveInt = Field(default=50)
