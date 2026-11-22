from src.application.itsm.priority import is_p1_priority
from src.application.itsm.ticket_suggestion import build_ticket_suggestion_fields


def test_is_p1_priority_accepts_variants() -> None:
    assert is_p1_priority("p1") is True
    assert is_p1_priority("P1") is True
    assert is_p1_priority("  P1  ") is True
    assert is_p1_priority(1) is True
    assert is_p1_priority("p2") is False
    assert is_p1_priority(None) is False


def test_build_ticket_suggestion_uses_first_line_as_title() -> None:
    content = {
        "blocks": [
            {"type": "text", "text": "VPN down\nSecond line detail"},
        ]
    }
    fields = build_ticket_suggestion_fields(content)
    assert fields == ("VPN down", "VPN down\nSecond line detail")


def test_build_ticket_suggestion_skips_media_only() -> None:
    content = {"blocks": [{"type": "media", "assetId": "00000000-0000-0000-0000-000000000001"}]}
    assert build_ticket_suggestion_fields(content) is None


def test_build_ticket_suggestion_joins_text_blocks() -> None:
    content = {
        "blocks": [
            {"type": "text", "text": "part one"},
            {"type": "text", "text": "part two"},
        ]
    }
    fields = build_ticket_suggestion_fields(content)
    assert fields is not None
    assert fields[0] == "part one"
    assert fields[1] == "part one part two"