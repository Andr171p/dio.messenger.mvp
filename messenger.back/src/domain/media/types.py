from enum import StrEnum


class MediaStatus(StrEnum):
    PENDING = "pending"
    UPLOADED = "uploaded"
    SCANNING = "scanning"
    READY = "ready"
    REJECTED = "rejected"
    DELETED = "deleted"


class MediaObjectRole(StrEnum):
    STAGING = "staging"
    ORIGINAL = "original"
    THUMBNAIL = "thumbnail"
    PREVIEW = "preview"


class UploadTargetType(StrEnum):
    MESSAGE = "message"
    CONVERSATION_AVATAR = "conversation_avatar"


class MediaPresentation(StrEnum):
    """Желаемое представление media block в сообщении (UX, не тип файла)."""

    FILE = "file"
    IMAGE = "image"
    VIDEO = "video"
    VOICE = "voice"
    VIDEO_NOTE = "video_note"


# presentation → обязательный content_type prefix (None = любой файл).
PRESENTATION_CONTENT_TYPE_PREFIX: dict[MediaPresentation, str | None] = {
    MediaPresentation.FILE: None,
    MediaPresentation.IMAGE: "image/",
    MediaPresentation.VIDEO: "video/",
    MediaPresentation.VOICE: "audio/",
    MediaPresentation.VIDEO_NOTE: "video/",
}


def presentation_matches_content_type(
    presentation: MediaPresentation,
    content_type: str,
) -> bool:
    """Совместимо ли запрошенное представление с фактическим типом файла."""
    prefix = PRESENTATION_CONTENT_TYPE_PREFIX[presentation]
    if prefix is None:
        return True
    return content_type.startswith(prefix)
