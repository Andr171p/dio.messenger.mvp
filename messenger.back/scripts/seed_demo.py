"""Seed demo chats + messages for local UI (IAM :8001 + Messenger API).

Uses existing DioDesk users (or resets their password to DEMO_PASSWORD via
optional ``--reset-passwords`` which shells into the DioDesk backend container).

Запуск из ``messenger.back``::

    uv run python scripts/seed_demo.py
    uv run python scripts/seed_demo.py --api http://127.0.0.1:8002 --reset-passwords

Логины после ``--reset-passwords``:
  admin@admin.com / admin
  anna.smirnova@test.com / demo123
  ivan.petrov@test.com / demo123
  maria.volkova@test.com / demo123
"""

from __future__ import annotations

from typing import Any

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

IAM_URL = "http://127.0.0.1:8001"
API_URL = "http://127.0.0.1:8002"
ADMIN_EMAIL = "admin@admin.com"
ADMIN_PASSWORD = "admin"
DEMO_PASSWORD = "demo123"

DEMO_USERS = [
    {
        "email": "anna.smirnova@test.com",
        "id": "a5e88d48-5f98-49ce-8328-6b836ee95947",
        "name": "Анна Смирнова",
    },
    {
        "email": "ivan.petrov@test.com",
        "id": "fe2f23fa-1a91-4cf6-bc25-3dfcf0e451fb",
        "name": "Иван Петров",
    },
    {
        "email": "maria.volkova@test.com",
        "id": "3bdc2ddf-36c1-496f-a2b5-08ebdbb0e8b1",
        "name": "Мария Волкова",
    },
]


def _request(
    method: str,
    url: str,
    *,
    token: str | None = None,
    json_body: dict[str, Any] | None = None,
    form: dict[str, str] | None = None,
    expected: int | tuple[int, ...] = 200,
) -> Any:
    headers: dict[str, str] = {}
    data: bytes | None = None
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    elif json_body is not None:
        data = json.dumps(json_body).encode()
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
            raw = resp.read().decode()
    except urllib.error.HTTPError as exc:
        status = exc.code
        raw = exc.read().decode()
        if status not in (expected if isinstance(expected, tuple) else (expected,)):
            raise SystemExit(f"{method} {url} -> {status}: {raw}") from exc

    allowed = expected if isinstance(expected, tuple) else (expected,)
    if status not in allowed:
        raise SystemExit(f"{method} {url} -> {status} expected {allowed}: {raw}")
    return json.loads(raw) if raw else None


def login(iam: str, email: str, password: str) -> str:
    body = _request(
        "POST",
        f"{iam}/api/v1/auth/login",
        form={"username": email, "password": password},
    )
    return body["access_token"]


def send_message(
    api: str,
    token: str,
    conversation_id: str,
    text: str,
    *,
    reply_to: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "clientMessageId": str(uuid.uuid4()),
        "blocks": [{"type": "text", "text": text}],
    }
    if reply_to:
        payload["replyToId"] = reply_to
    return _request(
        "POST",
        f"{api}/v1/conversations/{conversation_id}/messages",
        token=token,
        json_body=payload,
        expected=201,
    )


def reset_passwords_via_diodesk_container() -> None:
    emails = [u["email"] for u in DEMO_USERS]
    py = f"""
from src.iam.security import hash_password
from src.core.database import session_factory
from sqlalchemy import text
import asyncio
EMAILS = {emails!r}
PASSWORD = {DEMO_PASSWORD!r}
async def main():
    async with session_factory() as session:
        for email in EMAILS:
            h = hash_password(PASSWORD)
            await session.execute(
                text("UPDATE users SET password_hash = :h WHERE email = :e"),
                {{"h": h, "e": email}},
            )
            print(email)
        await session.commit()
asyncio.run(main())
"""
    cmd = [
        "docker",
        "exec",
        "diodesk_fork_prod_version-backend-1",
        "python",
        "-c",
        py,
    ]
    print("Resetting demo passwords in DioDesk…")
    subprocess.run(cmd, check=True)


def seed(api: str, iam: str) -> None:
    admin = login(iam, ADMIN_EMAIL, ADMIN_PASSWORD)
    print("OK admin login")

    anna_id, ivan_id, maria_id = (u["id"] for u in DEMO_USERS)

    group = _request(
        "POST",
        f"{api}/v1/conversations",
        token=admin,
        json_body={
            "title": "Дежурная смена",
            "memberIds": [anna_id, ivan_id, maria_id],
        },
        expected=201,
    )
    print(f"OK group {group['id']} «{group.get('title')}»")

    direct = _request(
        "POST",
        f"{api}/v1/conversations/direct",
        token=admin,
        json_body={"peerId": anna_id},
        expected=201,
    )
    print(f"OK direct {direct['id']}")

    impl = _request(
        "POST",
        f"{api}/v1/conversations",
        token=admin,
        json_body={"title": "Внедрение", "memberIds": [ivan_id, maria_id]},
        expected=201,
    )
    print(f"OK group {impl['id']} «{impl.get('title')}»")

    g = group["id"]
    m_vpn = send_message(
        api,
        admin,
        g,
        "Проверьте пожалуйста VPN у клиента — тикет #INC-228",
    )
    send_message(api, admin, g, "Доброе утро! На смене сегодня я и Анна.")
    send_message(api, admin, g, "Обновление завершено, мониторинг в норме.")
    send_message(
        api,
        admin,
        g,
        "Принял, смотрю логи.",
        reply_to=m_vpn["id"],
    )
    send_message(api, admin, direct["id"], "Анна, можешь глянуть INC-228 по VPN?")
    send_message(api, admin, direct["id"], "Если нужно — созвонимся в 12:00.")
    send_message(api, admin, impl["id"], "Согласовали план на спринт.")
    send_message(api, admin, impl["id"], "Завтра демо для заказчика в 15:00.")

    _request(
        "POST",
        f"{api}/v1/conversations/{g}/reactions",
        token=admin,
        json_body={"messageId": m_vpn["id"], "emoji": "👍"},
        expected=(200, 201),
    )

    # Multi-author messages
    for user in DEMO_USERS:
        try:
            token = login(iam, user["email"], DEMO_PASSWORD)
        except SystemExit as exc:
            print(f"SKIP {user['email']}: cannot login ({exc})")
            print("  Hint: re-run with --reset-passwords")
            continue

        if user["email"].startswith("anna"):
            send_message(
                api,
                token,
                g,
                "Беру INC-228, смотрю клиентский VPN-лог.",
            )
            send_message(
                api,
                token,
                direct["id"],
                "Привет! Да, гляну VPN после обеда.",
            )
            _request(
                "POST",
                f"{api}/v1/conversations/{g}/pins",
                token=token,
                json_body={"messageId": m_vpn["id"]},
                expected=(200, 201),
            )
            print(f"OK messages from {user['name']}")
            # maria reacts to anna
            continue

        if user["email"].startswith("ivan"):
            send_message(
                api,
                token,
                g,
                "На стороне шлюза ошибок нет, похоже на клиентский профиль.",
                reply_to=m_vpn["id"],
            )
            send_message(api, token, impl["id"], "Артефакты для демо готовы.")
            print(f"OK messages from {user['name']}")
            continue

        if user["email"].startswith("maria"):
            send_message(api, token, g, "Добавила заметку в карточку заявки.")
            send_message(api, token, impl["id"], "Слайды загрузила в Confluence.")
            print(f"OK messages from {user['name']}")

    print()
    print("Demo ready. Login in Messenger UI:")
    print(f"  {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    for u in DEMO_USERS:
        print(f"  {u['email']} / {DEMO_PASSWORD}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed DIO Messenger demo data")
    parser.add_argument("--api", default=API_URL)
    parser.add_argument("--iam", default=IAM_URL)
    parser.add_argument(
        "--reset-passwords",
        action="store_true",
        help="Set DEMO_PASSWORD for anna/ivan/maria via DioDesk backend container",
    )
    args = parser.parse_args()
    if args.reset_passwords:
        reset_passwords_via_diodesk_container()
    seed(args.api.rstrip("/"), args.iam.rstrip("/"))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
