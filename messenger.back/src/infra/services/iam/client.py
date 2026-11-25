from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from http import HTTPStatus
from uuid import UUID

import aiohttp
from pydantic import UUID4, BaseModel, EmailStr, Field

from src.application.auth.dtos import Auth, AuthType, PrincipalKind, principal_kind_from_roles
from src.application.auth.exceptions import UnauthorizedError

from .config import SrvIamConfig


class _Userinfo(BaseModel):
    id: UUID4
    email: EmailStr
    roles: set[str] = Field(default_factory=set)
    counterparty_id: UUID | None = None


class _DeskUserPageItem(BaseModel):
    id: UUID4
    email: EmailStr
    full_name: str | None = None
    username: str | None = None
    avatar_url: str | None = None
    roles: set[str] = Field(default_factory=set)
    counterparty_id: UUID | None = None
    is_active: bool = True


class _DeskUserPage(BaseModel):
    items: list[_DeskUserPageItem] = Field(default_factory=list)
    total: int | None = None
    page: int | None = None
    size: int | None = None


class InviteCatalogUser(BaseModel):
    id: UUID
    email: EmailStr
    full_name: str | None = None
    username: str | None = None
    avatar_url: str | None = None
    roles: frozenset[str] = Field(default_factory=frozenset)
    counterparty_id: UUID | None = None
    principal_kind: PrincipalKind


class SrvIamClient:
    def __init__(self, config: SrvIamConfig) -> None:
        self._config = config
        self._session: aiohttp.ClientSession | None = None

    @asynccontextmanager
    async def _get_session(self) -> AsyncIterator[aiohttp.ClientSession]:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=self._config.timeout)
            self._session = aiohttp.ClientSession(base_url=str(self._config.base_url), timeout=timeout)

        yield self._session

    async def authenticate(self, token: str) -> Auth:
        """Получает аутентифицированный субъект."""

        headers = {"Authorization": f"Bearer {token}"}

        async with (
            self._get_session() as session,
            session.get("/api/v1/auth/userinfo", headers=headers) as response,
        ):
            if response.status == HTTPStatus.UNAUTHORIZED:
                raise UnauthorizedError("Invalid or expired access token.")

            response.raise_for_status()
            data = await response.json()

        userinfo = _Userinfo.model_validate(data)
        roles = frozenset(userinfo.roles)
        return Auth(
            id=userinfo.id,
            type=AuthType.USER,
            user=Auth.User(
                id=userinfo.id,
                email=userinfo.email,
                roles=roles,
                counterparty_id=userinfo.counterparty_id,
                principal_kind=principal_kind_from_roles(roles),
            ),
        )

    async def search_users(
        self,
        token: str,
        *,
        query: str | None = None,
        page: int = 1,
        size: int = 20,
    ) -> list[InviteCatalogUser]:
        """Каталог пользователей Desk для invite (прокси к GET /api/v1/users)."""

        headers = {"Authorization": f"Bearer {token}"}
        params: dict[str, str | int] = {"page": page, "size": size}
        if query:
            params["q"] = query
            params["search"] = query

        async with (
            self._get_session() as session,
            session.get("/api/v1/users", headers=headers, params=params) as response,
        ):
            if response.status == HTTPStatus.UNAUTHORIZED:
                raise UnauthorizedError("Invalid or expired access token.")
            response.raise_for_status()
            data = await response.json()

        page_data = _DeskUserPage.model_validate(data if isinstance(data, dict) else {"items": data})
        needle = (query or "").strip().lower()
        results: list[InviteCatalogUser] = []
        for item in page_data.items:
            if not item.is_active:
                continue
            if needle:
                haystacks = [
                    item.email.lower(),
                    (item.full_name or "").lower(),
                    (item.username or "").lower(),
                ]
                if not any(needle in value for value in haystacks):
                    continue
            roles = frozenset(item.roles)
            results.append(
                InviteCatalogUser(
                    id=item.id,
                    email=item.email,
                    full_name=item.full_name,
                    username=item.username,
                    avatar_url=item.avatar_url,
                    roles=roles,
                    counterparty_id=item.counterparty_id,
                    principal_kind=principal_kind_from_roles(roles),
                )
            )
        return results

    async def close(self) -> None:
        if self._session is None or self._session.closed:
            return

        await self._session.close()
        self._session = None
