from pydantic import Field, NonNegativeInt
from pydantic_settings import BaseSettings, SettingsConfigDict


class MessagingConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MESSAGING_")

    edit_window_seconds: NonNegativeInt = Field(
        default=900,
        description="Окно редактирования сообщения в секундах; 0 — без ограничения по времени",
    )
    max_media_per_message: NonNegativeInt = Field(default=10)
    max_message_length: NonNegativeInt = Field(default=10_000)
