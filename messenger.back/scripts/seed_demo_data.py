"""Засев демо-данных DIO Desk + очистка messenger.

- Чистит тестовых пользователей (кроме admin) и все заявки/вложения/комментарии.
- Чистит чаты/сообщения/медиа messenger.
- Добавляет 5 демо-пользователей (пароль demo123) и ~8 заявок с исполнителями.
- Аватарки — base64 data URI; вложения — записи без реальных файлов (заглушки).

Запуск: python scripts/seed_demo_data.py
"""

import asyncio
import base64
import json
from pathlib import Path

import asyncpg

DIO_URL = "postgresql://diocontickets:diocontickets12345@localhost:5436/diocontickets_db"
MESSENGER_URL = "postgresql://messenger:messenger@localhost:5434/messenger"

AVATAR_DIR = Path(__file__).resolve().parent.parent.parent / "_demo_avatars"

# 5 уникальных argon2id-хешей для пароля "demo123" (password_hash в users уникален).
PASSWORD_HASHES = [
    "$argon2id$v=19$m=100,t=2,p=2$vRcCQEjp3VsrJUQoRcj5nw$u2mokg7SoAVDegVAmfOCRiR1Fk2jQ+zZb/fTRIQ39ws",
    "$argon2id$v=19$m=100,t=2,p=2$lDJGiHHOuffem5PSWkuJ8Q$bNTW5UfpR46w/WeLMhBZeDkEacpQYSM90zhgsQj95eQ",
    "$argon2id$v=19$m=100,t=2,p=2$N2YsJYQQAkDIOYfQmjPmHA$fI3HXo/0kbOYwTwNv9ig+i367mm8TJm8nRJgL9DSlcw",
    "$argon2id$v=19$m=100,t=2,p=2$Sel9by1FyHnv3TvnPCdEaA$xz4Rr2QXK7mUPS4Ee8xyLh43Fm+cVANkjmTBHmJ3WI4",
    "$argon2id$v=19$m=100,t=2,p=2$eQ8hJISQ0loLQegdozRGaA$xax1Ej7kwSMxVGxe+tIIg1GVAdWAwe6Kxa0Q43UVjQU",
]

USERS = [
    {
        "email": "chis@diocon.ru",
        "username": "chumarov.i.s",
        "full_name": "Чумаров Иван Сергеевич",
        "roles": ["support_manager"],
        "avatar": "2.jpg",
    },
    {
        "email": "n.rozova@diocon.ru",
        "username": None,
        "full_name": "Розова Наталья",
        "roles": ["support_agent"],
        "avatar": "3.jpg",
    },
    {
        "email": "a.s.kosov@diocon.ru",
        "username": "kosov.a.s",
        "full_name": "Косов Андрей Сергеевич",
        "roles": ["developer"],
        "avatar": None,
    },
    {
        "email": "d.v.balitskiy@diocon.ru",
        "username": "denisbali",
        "full_name": "Балицкий Денис Владимирович",
        "roles": ["developer"],
        "avatar": None,
    },
    {
        "email": "a.v.medvedev@diocon.ru",
        "username": "medvedv",
        "full_name": "Медведев Андрей Вальеревич",
        "roles": ["support_agent"],
        "avatar": "4.jpg",
    },
]

# assignee → email ключ пользователя
TICKETS = [
    {
        "title": "Не работает VPN-подключение из внешней сети",
        "description": (
            "Сотрудники не могут подключиться к корпоративному VPN из дома. При подключении "
            "появляется ошибка «Не удалось установить соединение». Проблема воспроизводится "
            "у нескольких пользователей с сегодняшнего утра."
        ),
        "ticket_type": "INCIDENT",
        "status": "IN_PROGRESS",
        "priority": "CRITICAL",
        "tags": [{"name": "vpn", "color": "#e74c3c"}, {"name": "сеть", "color": "#3498db"}],
        "assignee": "a.s.kosov@diocon.ru",
        "attachments": [("vpn_client.log", "text/plain", 4096, "demo/attachments/vpn_client.log")],
    },
    {
        "title": "Ошибка 500 при формировании отчёта в личном кабинете",
        "description": (
            "При попытке сформировать ежемесячный отчёт по заявкам появляется ошибка 500. "
            "В логах сервера видна ошибка в SQL-запросе. Отчёт не формируется уже второй день."
        ),
        "ticket_type": "INCIDENT",
        "status": "IN_PROGRESS",
        "priority": "HIGH",
        "tags": [{"name": "отчёты", "color": "#3498db"}, {"name": "bug", "color": "#e74c3c"}],
        "assignee": "a.s.kosov@diocon.ru",
        "attachments": [
            ("screenshot_error_500.png", "image/png", 245760, "demo/attachments/screenshot_error_500.png"),
        ],
    },
    {
        "title": "Не приходят email-уведомления о новых заявках",
        "description": (
            "Пользователи перестали получать уведомления на почту о создании и изменении заявок. "
            "Проверили настройки — в личном кабинете уведомления включены."
        ),
        "ticket_type": "INCIDENT",
        "status": "OPEN",
        "priority": "MEDIUM",
        "tags": [{"name": "уведомления", "color": "#3498db"}, {"name": "почта", "color": "#9b59b6"}],
        "assignee": "n.rozova@diocon.ru",
        "attachments": [],
    },
    {
        "title": "Нужен доступ к корпоративной базе знаний для нового сотрудника",
        "description": (
            "Прошу предоставить доступ к разделу базы знаний для нового сотрудника отдела поддержки. "
            "Доступ нужен к разделам «Регламенты» и «Инструкции»."
        ),
        "ticket_type": "SERVICE_REQUEST",
        "status": "NEW",
        "priority": "LOW",
        "tags": [{"name": "доступ", "color": "#27ae60"}, {"name": "база знаний", "color": "#3498db"}],
        "assignee": "n.rozova@diocon.ru",
        "attachments": [],
    },
    {
        "title": "Долго загружается список заявок при большом количестве записей",
        "description": (
            "Страница со списком заявок загружается более 10 секунд, когда в таблице больше 5000 записей. "
            "Нужно оптимизировать запрос или добавить пагинацию/индексы."
        ),
        "ticket_type": "PROBLEM",
        "status": "OPEN",
        "priority": "HIGH",
        "tags": [
            {"name": "производительность", "color": "#e67e22"},
            {"name": "postgresql", "color": "#3498db"},
        ],
        "assignee": "a.v.medvedev@diocon.ru",
        "attachments": [],
    },
    {
        "title": "Обновить SSL-сертификат портала до истечения срока",
        "description": (
            "SSL-сертификат основного домена истекает через 14 дней. Необходимо выпустить "
            "новый сертификат и установить его на балансировщик."
        ),
        "ticket_type": "TASK",
        "status": "NEW",
        "priority": "MEDIUM",
        "tags": [{"name": "ssl", "color": "#27ae60"}, {"name": "инфраструктура", "color": "#e67e22"}],
        "assignee": "a.v.medvedev@diocon.ru",
        "attachments": [],
    },
    {
        "title": "Не открывается вложение в формате .docx в веб-версии",
        "description": (
            "При попытке открыть вложение .docx в веб-версии заявки ничего не происходит или "
            "скачивается повреждённый файл. В нативном приложении всё работает."
        ),
        "ticket_type": "INCIDENT",
        "status": "OPEN",
        "priority": "MEDIUM",
        "tags": [{"name": "вложения", "color": "#3498db"}, {"name": "веб-версия", "color": "#9b59b6"}],
        "assignee": "a.s.kosov@diocon.ru",
        "attachments": [],
    },
    {
        "title": "Настроить интеграцию с 1С для выгрузки счетов",
        "description": (
            "Требуется настроить интеграцию с 1С:Бухгалтерия для автоматической выгрузки счетов и актов. "
            "Нужно согласовать формат обмена и реализовать обмен данными."
        ),
        "ticket_type": "CHANGE",
        "status": "NEW",
        "priority": "HIGH",
        "tags": [{"name": "1С", "color": "#e74c3c"}, {"name": "интеграция", "color": "#3498db"}],
        "assignee": "a.s.kosov@diocon.ru",
        "attachments": [
            (
                "Требования_к_интеграции_1С.docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                15360,
                "demo/attachments/requirements_1c.docx",
            ),
        ],
    },
]


def _data_uri(path: Path) -> str:
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/jpeg;base64,{b64}"


async def clean_diodesk(conn: asyncpg.Connection) -> None:
    await conn.execute("DELETE FROM attachments")
    await conn.execute("DELETE FROM reactions")
    await conn.execute("DELETE FROM comments")
    await conn.execute("DELETE FROM activity_logs")
    await conn.execute("DELETE FROM notifications")
    await conn.execute("DELETE FROM tickets")
    await conn.execute("DELETE FROM invitations")
    await conn.execute("DELETE FROM users WHERE email != 'admin@admin.com'")


async def clean_messenger(conn: asyncpg.Connection) -> None:
    tables = (
        "audit_events, context_links, conversation_events, conversation_members, "
        "conversation_policies, conversation_threads, conversations, media_assets, "
        "media_objects, message_media, message_pins, message_reactions, messages, "
        "outbox_messages, poll_options, poll_votes, polls, scheduled_messages"
    )
    await conn.execute(f"TRUNCATE {tables} CASCADE")


async def seed_diodesk(conn: asyncpg.Connection) -> None:
    admin_id = await conn.fetchval("SELECT id FROM users WHERE email = 'admin@admin.com'")

    user_ids: dict[str, str] = {}
    for i, user in enumerate(USERS):
        avatar = None
        if user["avatar"]:
            avatar = _data_uri(AVATAR_DIR / user["avatar"])
        uid = await conn.fetchval(
            """
            INSERT INTO users (email, username, full_name, avatar_url, roles, password_hash, is_active)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, true)
            RETURNING id
            """,
            user["email"],
            user["username"],
            user["full_name"],
            avatar,
            json.dumps(user["roles"], ensure_ascii=False),
            PASSWORD_HASHES[i],
        )
        user_ids[user["email"]] = str(uid)

    for n, ticket in enumerate(TICKETS, start=1):
        number = f"INT-26-{n:08d}"
        assignee_id = user_ids[ticket["assignee"]]
        ticket_id = await conn.fetchval(
            """
            INSERT INTO tickets (
                created_by, reporter_id, assignee_id, number, title, description,
                ticket_type, status, priority, tags
            )
            VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
            RETURNING id
            """,
            admin_id,
            assignee_id,
            number,
            ticket["title"],
            ticket["description"],
            ticket["ticket_type"],
            ticket["status"],
            ticket["priority"],
            json.dumps(ticket["tags"], ensure_ascii=False),
        )
        for filename, mime, size, storage_key in ticket["attachments"]:
            await conn.execute(
                """
                INSERT INTO attachments (
                    original_filename, mime_type, size_bytes, storage_key,
                    owner_type, owner_id, is_public, uploaded_at, uploaded_by
                )
                VALUES ($1, $2, $3, $4, 'ticket', $5, false, now(), $6)
                """,
                filename,
                mime,
                size,
                storage_key,
                ticket_id,
                admin_id,
            )


async def main() -> None:
    dio = await asyncpg.connect(DIO_URL)
    try:
        await clean_diodesk(dio)
        await seed_diodesk(dio)
    finally:
        await dio.close()

    msg = await asyncpg.connect(MESSENGER_URL)
    try:
        await clean_messenger(msg)
    finally:
        await msg.close()

    print("DONE")
    print("Пользователи (пароль demo123):")
    for user in USERS:
        print(f"  - {user['full_name']} <{user['email']}>  roles={user['roles']}")
    print(f"Заявок: {len(TICKETS)}")


if __name__ == "__main__":
    asyncio.run(main())
