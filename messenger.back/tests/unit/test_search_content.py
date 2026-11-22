from src.application.messaging.content import extract_searchable_text
from src.application.search.queries import _MIN_TRGM_QUERY_LEN, _normalize_query


def test_extract_searchable_text_joins_text_blocks() -> None:
    content = {
        "blocks": [
            {"type": "text", "text": "  Привет  "},
            {"type": "media", "assetId": "00000000-0000-0000-0000-000000000001"},
            {"type": "text", "text": "мир"},
        ]
    }
    assert extract_searchable_text(content) == "Привет мир"


def test_extract_searchable_text_empty() -> None:
    assert extract_searchable_text({"blocks": []}) == ""


def test_normalize_query_strips() -> None:
    assert _normalize_query("  foo  ") == "foo"
    assert _normalize_query("   ") is None


def test_min_query_length() -> None:
    assert _MIN_TRGM_QUERY_LEN == 3