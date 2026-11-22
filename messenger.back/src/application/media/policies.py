from pathlib import Path

from src.application.media.config import MediaConfig
from src.application.media.exceptions import MediaPolicyViolationError


def validate_upload_request(
    *,
    filename: str,
    content_type: str,
    size: int,
    config: MediaConfig | None = None,
) -> None:
    settings = config or MediaConfig()
    if not filename.strip():
        raise MediaPolicyViolationError("Filename is required.")
    if len(filename) > settings.max_filename_length:
        raise MediaPolicyViolationError("Filename is too long.")
    if Path(filename).name != filename:
        raise MediaPolicyViolationError("Filename must not contain path separators.")
    if size <= 0:
        raise MediaPolicyViolationError("File size must be positive.")
    if size > settings.max_upload_bytes:
        raise MediaPolicyViolationError("File exceeds maximum allowed size.")
    if content_type not in settings.allowed_content_types:
        raise MediaPolicyViolationError(f"Content type {content_type!r} is not allowed.")
