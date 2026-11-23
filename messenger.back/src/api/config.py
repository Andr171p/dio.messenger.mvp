from typing import Annotated

from pydantic import BeforeValidator, Field
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def _split_csv(value: object) -> object:
    if isinstance(value, str):
        return [part.strip() for part in value.split(",") if part.strip()]
    return value


CsvList = Annotated[list[str], NoDecode, BeforeValidator(_split_csv)]


def _default_origins() -> list[str]:
    return [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ]


class CorsConfig(BaseSettings):
    """CORS для браузерного фронтенда (Vite dev / preview)."""

    model_config = SettingsConfigDict(env_prefix="MESSENGER_CORS_", frozen=True)

    origins: CsvList = Field(default_factory=_default_origins)
    allow_credentials: bool = Field(default=True)
    allow_methods: CsvList = Field(default_factory=lambda: ["*"])
    allow_headers: CsvList = Field(default_factory=lambda: ["*"])
