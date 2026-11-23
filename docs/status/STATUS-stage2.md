# Status: Stage 2 — Outbox + WebSocket + Sync

- **Дата:** 2026-11-22
- **Решение:** [DEC-0004](decisions/DEC-0004-stage2-outbox-ws-sync.md)

## Что сделано

| Компонент | Статус |
|---|---|
| Outbox relay → RabbitMQ | `python -m src.infra.outbox.relay` |
| Rabbit → Redis fanout | в API `lifespan` |
| WS `/v1/ws` + ticket | `POST /v1/ws/tickets`, rooms ACL |
| `GET /v1/sync/manifest` | high-water marks |
| Edit / delete / read-cursor | HTTP + ConversationEvent + outbox |

## Как запустить локально

1. Docker: Postgres, Redis, RabbitMQ, RustFS.
2. API: `uvicorn src.main:app --reload --port 8000` (из `messenger.back`, с `.env`).
3. Relay: `python -m src.infra.outbox.relay` (отдельный терминал).
4. DioDesk IAM на `:8001`.

## Ручной чеклист

1. `POST /v1/ws/tickets` → ticket.
2. Подключить WS `ws://localhost:8000/v1/ws?ticket=…`.
3. `subscribe` `{ "type": "subscription.subscribe", "payload": { "topic": "conversation", "key": "<id>" } }`.
4. Другим клиентом `POST …/messages` → на WS приходит `message.created` (compact).
5. `GET /v1/sync/manifest` → conversation с обновлённым `lastEventSeq`.
6. `PATCH` / `DELETE` сообщения → WS `message.edited` / `message.deleted`.
7. Остановить relay → send → стартовать relay → событие доходит (polling/NOTIFY recovery).

## Env

| Переменная | Пример |
|---|---|
| `RABBIT_*` | как в `.env.example` |
| `RABBIT_EXCHANGE` | `messenger.events` (DDF RabbitConfig) |
| `REDIS_*` | host/port для tickets + realtime |
| `OUTBOX_WORKER_POLL_INTERVAL` | `1.0` (fallback) |

## Файлы

- `src/infra/outbox/relay.py`
- `src/infra/realtime/` — rooms, fanout, tickets
- `src/api/lifespan.py`, `src/api/realtime_runtime.py`
- `src/api/routers/websocket/connection.py`
- `src/api/routers/user/sync.py`, `ws_tickets.py`
- `src/application/messaging/commands.py` — edit/delete/read-cursor
- `src/application/sync/`
