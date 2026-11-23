# DEC-0005 — Presence / typing / reactions

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** [ARCHITECTURE.md](../architecture/ARCHITECTURE.md) §9–10; хвост Этапа 1–2 перед фронтом

## Решение

### Typing (ephemeral)

- Транспорт: **только WebSocket**, не durable log / не ConversationEvent.
- Client → server: `typing.started` / `typing.stopped` с `conversationId`.
- Server: membership check → Redis key `typing:{conversation_id}:{user_id}` TTL **5s** → publish `typing.updated` в room `conversation:{id}`.
- Throttle: повторный `typing.started` от того же user/conversation не чаще **1/s** (обновляет TTL, но не спамит fanout если уже typing).
- `typing.stopped` или истечение TTL → fanout `typing.updated` со `status: stopped` (stopped по TTL — best-effort: клиент сам гасит UI по timeout).

### Presence (ephemeral)

- При WS connect: Redis `presence:{org}:{user}` = online, TTL **60s**, publish `presence.changed` в `user:{org}:{user}` (мульти-девайс / собственные вкладки).
- Heartbeat: любое входящее WS-сообщение или явный `presence.ping` обновляет TTL.
- При disconnect: если не осталось живого TTL — `presence.changed` `offline` в user room.
- Агрегация по сессиям: счётчик `presence:sessions:{org}:{user}`; offline только при 0.

### Reactions (durable)

- Таблица `message_reactions` UNIQUE `(message_id, actor_id, emoji)`.
- HTTP: `POST /v1/conversations/{id}/reactions`, `DELETE …/messages/{messageId}/reactions/{emoji}`.
- В одной TX: row + `ConversationEvent` (`reaction.added` / `reaction.removed`) + outbox domain event.
- WS fanout compact через существующий outbox → Rabbit → Redis path.
- Idempotent add (повтор того же emoji → 200 существующее); remove отсутствующего → 204.

## Не в этом срезе

- Presence fanout всем contacts / roster
- Typing indicator persistence
- Custom reaction packs / unicode validation сверх длины
- Aggregate reactions внутри MessageDTO history (отдельный GET)
