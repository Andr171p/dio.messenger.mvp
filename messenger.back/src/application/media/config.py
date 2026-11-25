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
            "audio/wav",
            "audio/mp4",
            "application/octet-stream",
        }
    )
    max_filename_length: NonNegativeInt = Field(default=255)
    waveform_bars: PositiveInt = Field(default=96)
    waveform_sample_rate: PositiveInt = Field(default=8000)
    # Переопределение путей к ffmpeg/ffprobe; пустое значение = поиск в PATH.
    ffmpeg_path: str = Field(default="")
    ffprobe_path: str = Field(default="")
