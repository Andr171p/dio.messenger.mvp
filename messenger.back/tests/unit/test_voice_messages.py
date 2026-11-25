from array import array
from uuid import uuid4

from src.application.media.audio import rms_envelope_from_pcm
from src.application.media.validation import (
    SniffResult,
    sniff_content_type,
    validate_declared_vs_sniffed,
)
from src.application.messaging.content import build_message_content, content_fingerprint, extract_media_blocks
from src.application.messaging.dtos import MediaBlock
from src.domain.media.types import MediaPresentation, presentation_matches_content_type


def _pcm(values: list[int]) -> bytes:
    samples = array("h", values)
    return samples.tobytes()


def test_presentation_matches_content_type() -> None:
    assert presentation_matches_content_type(MediaPresentation.VOICE, "audio/webm")
    assert presentation_matches_content_type(MediaPresentation.VOICE, "audio/mp4")
    assert not presentation_matches_content_type(MediaPresentation.VOICE, "video/mp4")
    assert not presentation_matches_content_type(MediaPresentation.VOICE, "image/jpeg")
    assert presentation_matches_content_type(MediaPresentation.VIDEO_NOTE, "video/mp4")
    assert presentation_matches_content_type(MediaPresentation.FILE, "application/pdf")


def test_rms_envelope_normalizes_constant_signal() -> None:
    pcm = _pcm([1000] * 1000)
    bars = rms_envelope_from_pcm(pcm, bar_count=4)
    assert bars == [100, 100, 100, 100]


def test_rms_envelope_silence_is_zero() -> None:
    pcm = _pcm([0] * 800)
    bars = rms_envelope_from_pcm(pcm, bar_count=8)
    assert bars == [0] * 8


def test_rms_envelope_bar_count_caps_at_sample_count() -> None:
    pcm = _pcm([500, -500, 500, -500])
    bars = rms_envelope_from_pcm(pcm, bar_count=96)
    assert len(bars) == 4


def test_sniff_audio_mp4_brand() -> None:
    header = b"\x00\x00\x00\x18ftypM4A " + b"\x00" * 16
    assert sniff_content_type(header).detected_content_type == "audio/mp4"


def test_sniff_audio_mp4_family_tolerates_video_mp4() -> None:
    header = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 16
    sniffed = sniff_content_type(header)
    assert sniffed.detected_content_type == "video/mp4"
    reason = validate_declared_vs_sniffed(declared_content_type="audio/mp4", sniffed=sniffed)
    assert reason is None


def test_declared_wav_is_allowed_for_trimmed_voice() -> None:
    sniffed = sniff_content_type(b"RIFF\x24\x00\x00\x00WAVEfmt ")
    assert sniffed.detected_content_type == "audio/wav"
    assert validate_declared_vs_sniffed(declared_content_type="audio/wav", sniffed=sniffed) is None
    assert validate_declared_vs_sniffed(declared_content_type="application/octet-stream", sniffed=sniffed) is None
    assert presentation_matches_content_type(MediaPresentation.VOICE, "audio/wav")


def test_build_content_includes_voice_presentation() -> None:
    asset_id = uuid4()
    content = build_message_content([MediaBlock(asset_id=asset_id, presentation=MediaPresentation.VOICE)])
    assert content == {
        "blocks": [{"type": "media", "assetId": str(asset_id), "presentation": "voice"}],
    }


def test_build_content_omits_default_file_presentation() -> None:
    asset_id = uuid4()
    content = build_message_content([MediaBlock(asset_id=asset_id)])
    assert content == {"blocks": [{"type": "media", "assetId": str(asset_id)}]}


def test_fingerprint_distinguishes_presentation() -> None:
    asset_id = uuid4()
    voice = build_message_content([MediaBlock(asset_id=asset_id, presentation=MediaPresentation.VOICE)])
    file = build_message_content([MediaBlock(asset_id=asset_id)])
    assert content_fingerprint(voice) != content_fingerprint(file)


def test_extract_media_blocks_preserves_presentation() -> None:
    asset_id = uuid4()
    content = {"blocks": [{"type": "media", "assetId": str(asset_id), "presentation": "voice"}]}
    assert extract_media_blocks(content) == [(asset_id, MediaPresentation.VOICE)]
