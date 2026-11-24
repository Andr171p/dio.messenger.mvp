"""HTTP-клиент DioDesk tickets API от имени пользовательского Bearer."""

from __future__ import annotations

import re
from typing import Any
from uuid import UUID

import aiohttp
from http import HTTPStatus

from src.application.itsm.exceptions import ItsmForbiddenError, ItsmNotFoundError, ItsmProviderError
from src.infra.services.diodesk.config import DioDeskConfig
from src.infra.services.iam.config import SrvIamConfig

_TICKET_NUMBER = re.compile(r"(?:[^\W\d_][^\W_]*-)?\d+(?:-\d+)*")
_NUMBER_LOOKUP_PAGES = 3


class DioDeskTicketsClient:
    def __init__(self, config: DioDeskConfig | None = None) -> None:
        desk = config or DioDeskConfig()
        iam = SrvIamConfig()  # type: ignore[call-arg]
        base = desk.base_url or iam.base_url
        self._base_url = str(base).rstrip("/")
        self._timeout = aiohttp.ClientTimeout(total=desk.timeout)
        self._session: aiohttp.ClientSession | None = None

    async def _session_get(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(
                base_url=self._base_url,
                timeout=self._timeout,
            )
        return self._session

    async def close(self) -> None:
        if self._session is None or self._session.closed:
            return
        await self._session.close()
        self._session = None

    async def get_ticket(self, ticket_id: UUID, *, access_token: str) -> dict[str, Any]:
        return await self._request(
            "GET",
            f"/api/v1/tickets/{ticket_id}",
            access_token=access_token,
        )

    async def create_ticket(self, payload: dict[str, Any], *, access_token: str) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/api/v1/tickets",
            access_token=access_token,
            json_body=payload,
            expected=(HTTPStatus.CREATED, HTTPStatus.OK),
        )

    async def attachment_download(self, attachment_id: UUID, *, access_token: str) -> str:
        result = await self._request(
            "GET", f"/api/v1/attachments/{attachment_id}/presigned-download", access_token=access_token,
        )
        url = result.get("download_url")
        if not isinstance(url, str):
            raise ItsmProviderError("DioDesk returned an invalid attachment download URL.")
        return url

    async def search_tickets(self, query: str, *, access_token: str) -> list[dict[str, Any]]:
        if query and _TICKET_NUMBER.fullmatch(query):
            return await self._find_ticket_number(query, access_token=access_token)
        response = await self._request(
            "POST", "/api/v1/tickets/search?size=10", access_token=access_token,
            json_body={"search_query": query} if query else {},
        )
        return [item for item in response.get("items", []) if isinstance(item, dict)]

    async def _find_ticket_number(self, query: str, *, access_token: str) -> list[dict[str, Any]]:
        # Desktop search indexes title and description. Limit the number of Desk pages read per lookup.
        matches: list[dict[str, Any]] = []
        needle = query.casefold()
        for page in range(1, _NUMBER_LOOKUP_PAGES + 1):
            response = await self._request(
                "POST", f"/api/v1/tickets/search?page={page}&size=50", access_token=access_token, json_body={},
            )
            items = response.get("items", [])
            for item in items:
                if not isinstance(item, dict):
                    continue
                number = str(item.get("number", "")).casefold()
                if number == needle:
                    return [item]
                if number.startswith(needle) and len(matches) < 10:
                    matches.append(item)
            if len(items) < 50:
                break
        return matches

    async def ticket_activity(self, ticket_id: UUID, *, access_token: str) -> list[dict[str, Any]]:
        response = await self._request(
            "GET", f"/api/v1/tickets/{ticket_id}/history?size=5", access_token=access_token,
        )
        return [item for item in response.get("items", []) if isinstance(item, dict)]

    async def assign(
        self,
        ticket_id: UUID,
        *,
        assignee_id: UUID,
        access_token: str,
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            f"/api/v1/tickets/{ticket_id}/assign",
            access_token=access_token,
            json_body={"assignee_id": str(assignee_id)},
        )

    async def change_status(
        self,
        ticket_id: UUID,
        *,
        new_status: str,
        access_token: str,
    ) -> dict[str, Any]:
        return await self._request(
            "PATCH",
            f"/api/v1/tickets/{ticket_id}/status",
            access_token=access_token,
            json_body={"new_status": new_status},
        )

    async def _request(
        self,
        method: str,
        path: str,
        *,
        access_token: str,
        json_body: dict[str, Any] | None = None,
        expected: tuple[int, ...] = (HTTPStatus.OK,),
    ) -> dict[str, Any]:
        session = await self._session_get()
        headers = {"Authorization": f"Bearer {access_token}"}
        try:
            async with session.request(method, path, headers=headers, json=json_body) as response:
                body: Any
                try:
                    body = await response.json(content_type=None)
                except Exception:  # noqa: BLE001
                    body = await response.text()

                if response.status == HTTPStatus.FORBIDDEN:
                    raise ItsmForbiddenError("DioDesk denied access to the ticket.")
                if response.status == HTTPStatus.NOT_FOUND:
                    raise ItsmNotFoundError("Ticket not found in DioDesk.")
                if response.status == HTTPStatus.UNAUTHORIZED:
                    raise ItsmForbiddenError("DioDesk rejected the access token.")
                if response.status not in expected:
                    raise ItsmProviderError(
                        f"DioDesk tickets API failed with status {response.status}.",
                        details={"status": response.status, "body": body},
                    )
                if not isinstance(body, dict):
                    raise ItsmProviderError("DioDesk returned non-object JSON.")
                return body
        except (ItsmForbiddenError, ItsmNotFoundError, ItsmProviderError):
            raise
        except aiohttp.ClientError as exc:
            raise ItsmProviderError("DioDesk tickets API unreachable.") from exc
