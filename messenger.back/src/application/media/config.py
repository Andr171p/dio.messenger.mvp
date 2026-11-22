from pydantic import Field, NonNegativeInt, PositiveInt
from pydantic_settings import BaseSettings, SettingsConfigDict


class MediaConfig(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MEDIA_")

    max_upload_bytes: PositiveInt = Field(default=50 * 1024 * 1024)
    upload_url_expires_in: PositiveInt = Field(default=3600)
    download_url_expires_in: PositiveInt = Field(default=180)
    allowed_content_types: set[str] = Field(
        default_factory=lambda: {
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "application/pdf",
            "video/mp4",
            "audio/mpeg",
            "audio/ogg",
            "audio/webm",
            "application/octet-stream",
        }
    )
    max_filename_length: NonNegativeInt = Field(default=255)
