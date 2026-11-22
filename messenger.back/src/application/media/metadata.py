"""Типизированные media metadata на application-границе (wire/DTO).

В домене и PostgreSQL хранится как JSONB `meta` без жёсткой схемы.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, NonNegativeInt, PositiveInt
from pydantic.alias_generators import to_camel


class ImageMeta(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    type: Literal["image"] = "image"
    width: PositiveInt
    height: PositiveInt


class VideoMeta(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    type: Literal["video"] = "video"
    width: PositiveInt
    height: PositiveInt
    duration_ms: NonNegativeInt


class AudioMeta(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    type: Literal["audio"] = "audio"
    duration_ms: NonNegativeInt


class DocumentMeta(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    type: Literal["document"] = "document"
    page_count: PositiveInt


MediaMeta = Annotated[
    ImageMeta | VideoMeta | AudioMeta | DocumentMeta,
    Field(discriminator="type"),
]


def parse_media_meta(raw: dict | None) -> MediaMeta | None:
    if raw is None:
        return None
    meta_type = raw.get("type")
    match meta_type:
        case "image":
            return ImageMeta.model_validate(raw)
        case "video":
            return VideoMeta.model_validate(raw)
        case "audio":
            return AudioMeta.model_validate(raw)
        case "document":
            return DocumentMeta.model_validate(raw)
        case _:
            return None
