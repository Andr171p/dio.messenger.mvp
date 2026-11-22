from pydantic import Field, HttpUrl, PositiveFloat
from pydantic_settings import BaseSettings, SettingsConfigDict


class DioDeskConfig(BaseSettings):
    """HTTP client к DioDesk (tickets). По умолчанию тот же host, что IAM."""

    model_config = SettingsConfigDict(env_prefix="DIODESK_", env_file=".env", extra="ignore")

    base_url: HttpUrl | None = Field(
        default=None,
        description="URL DioDesk; если пусто — используется SRV_IAM_BASE_URL",
    )
    timeout: PositiveFloat = Field(default=15, description="Таймаут HTTP к Desk")
