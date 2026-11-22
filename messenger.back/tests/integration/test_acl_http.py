"""Live HTTP ACL checks against a running Messenger API."""

from __future__ import annotations

import os
from uuid import uuid4

import httpx
import pytest

pytestmark = pytest.mark.integration


def _api_base_url() -> str | None:
    base = os.getenv("MESSENGER_API_URL")
    if not base:
        return None
    return base.rstrip("/")


@pytest.mark.asyncio
async def test_non_member_conversation_returns_404() -> None:
    base = _api_base_url()
    if not base:
        pytest.skip("MESSENGER_API_URL is not set.")

    token = os.getenv("MESSENGER_API_BEARER_TOKEN") or os.getenv("MESSENGER_ACCESS_TOKEN")
    if not token:
        pytest.skip("Set MESSENGER_API_BEARER_TOKEN (or MESSENGER_ACCESS_TOKEN) for live API ACL test.")

    headers = {"Authorization": f"Bearer {token}"}
    conversation_id = uuid4()

    async with httpx.AsyncClient(base_url=base, headers=headers, timeout=30.0) as client:
        response = await client.get(f"/v1/conversations/{conversation_id}")

    assert response.status_code == 404
