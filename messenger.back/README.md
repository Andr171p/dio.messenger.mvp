# DIO Messenger — backend

Запуск: `uvicorn src.main:app --reload --port 8002` из каталога `messenger.back`.

## Локальное окружение

1. Скопировать `.env.example` → `.env` (в корне репозитория и/или здесь).
2. Поднять инфраструктуру из корня `dio.messenger`:

```bash
docker compose up -d
```

3. Миграции:

```bash
alembic upgrade head
```

4. Auth: DioDesk (`C:\Users\andre\diodesk_fork_prod_version`) на `http://localhost:8001`; `SRV_IAM_BASE_URL` указывает туда.
5. Из `messenger.back` запустить relay в отдельном терминале через `python -m src.infra.outbox.relay`. Relay доставляет сохранённые сообщения, реакции и другие события в WebSocket. Для вложений запустить `python -m src.infra.media.worker`.

## Порты (defaults)

| Сервис | Host port |
|---|---|
| API (локально) | 8002 |
| PostgreSQL | 5434 |
| Redis | 6381 |
| RabbitMQ | 5674 / 15674 |
| RustFS | 9010 / 9011 |
