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
