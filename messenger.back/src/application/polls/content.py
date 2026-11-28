from typing import Any

from uuid import UUID


def build_poll_message_content(*, question: str, poll_id: UUID, allows_multiple: bool) -> dict[str, Any]:
    return {
        "blocks": [{"type": "text", "text": question}],
        "poll": {
            "pollId": str(poll_id),
            "allowsMultiple": allows_multiple,
            "closed": False,
        },
    }


def mark_poll_closed_in_content(content: dict[str, Any]) -> dict[str, Any]:
    updated = dict(content)
    poll = dict(updated.get("poll") or {})
    poll["closed"] = True
    updated["poll"] = poll
    return updated
