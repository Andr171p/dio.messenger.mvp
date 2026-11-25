"""Pure validation helpers for the media lifecycle worker."""

from dataclasses import dataclass

from src.application.media.config import MediaConfig

_EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"

_MAGIC: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"%PDF", "application/pdf"),
    (b"ID3", "audio/mpeg"),
    (b"OggS", "audio/ogg"),
    (b"\xff\xfb", "audio/mpeg"),
    (b"\xff\xf3", "audio/mpeg"),
    (b"\xff\xf2", "audio/mpeg"),
]

_OCTET_STREAM = "application/octet-stream"

# ISO-BMFF контейнер: audio-only и video MP4 различаются только потоками внутри.
# Точный stream-тип подтверждает ffprobe в worker.
_MP4_FAMILY = {"audio/mp4", "video/mp4"}


@dataclass(frozen=True, slots=True)
class SniffResult:
    detected_content_type: str | None
    matched: bool


def sniff_content_type(header: bytes) -> SniffResult:
    if header.startswith(b"\x1a\x45\xdf\xa3") and b"\x42\x82\x84webm" in header[:64]:
        return SniffResult(detected_content_type="audio/webm", matched=True)
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WEBP":
        return SniffResult(detected_content_type="image/webp", matched=True)
    if len(header) >= 12:
        offset = header.find(b"ftyp")
        if offset != -1 and offset <= 8:
            brand = header[offset + 4 : offset + 8]
            if brand in {b"M4A ", b"M4B ", b"M4P "}:
                return SniffResult(detected_content_type="audio/mp4", matched=True)
            if brand in {b"mp42", b"isom", b"iso2", b"avc1", b"MSNV"}:
                return SniffResult(detected_content_type="video/mp4", matched=True)
    for prefix, content_type in _MAGIC:
        if header.startswith(prefix):
            return SniffResult(detected_content_type=content_type, matched=True)
    return SniffResult(detected_content_type=None, matched=False)


def stub_antivirus_scan(payload: bytes) -> str | None:
    """Return rejection reason when malware is detected (EICAR test pattern)."""
    if _EICAR in payload:
        return "Malware detected (stub scanner)."
    return None


def validate_declared_vs_sniffed(
    *,
    declared_content_type: str,
    sniffed: SniffResult,
    config: MediaConfig | None = None,
) -> str | None:
    settings = config or MediaConfig()
    if not sniffed.detected_content_type:
        if declared_content_type == _OCTET_STREAM:
            return None
        return "Unable to verify file format from content."
    if declared_content_type == _OCTET_STREAM:
        if sniffed.detected_content_type not in settings.allowed_content_types:
            return f"Detected content type {sniffed.detected_content_type!r} is not allowed."
        return None
    if (
        declared_content_type in _MP4_FAMILY
        and sniffed.detected_content_type in _MP4_FAMILY
    ):
        return None
    if declared_content_type != sniffed.detected_content_type:
        return (
            f"Declared content type {declared_content_type!r} does not match "
            f"detected {sniffed.detected_content_type!r}."
        )
    return None


def build_ready_meta(*, content_type: str) -> dict | None:
    if content_type.startswith("image/"):
        return {"type": "image", "width": 1, "height": 1}
    return None
