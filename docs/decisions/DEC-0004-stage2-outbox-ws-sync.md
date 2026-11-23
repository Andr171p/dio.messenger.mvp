# DEC-0004 — Этап 2: Outbox relay + WebSocket + Sync

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision (не ADR)
- **Контекст:** [IMPLEMENTATION_PLAN.md](../development/IMPLEMENTATION_PLAN.md) Этап 2; [ADR-0002](../adr/ADR-0002-http-websocket-and-sync.md); [ADR-0003](../adr/ADR-0003-transactional-outbox-and-realtime.md)

## Решение

1. **Outbox relay** — отдельный процесс `python -m src.infra.outbox.relay`:
   - `LISTEN messenger_outbox` + polling fallback (`run_postgres_notify_worker`);
   - publish в RabbitMQ durable queue `messenger.realtime.fanout` envelope `{ eventType, payload }`.

2. **Realtime fanout** — в API lifespan:
   - competing consumer той же Rabbit queue → Redis `RealtimePublisher`;
   - каждый API-инстанс подписывается на Redis channel и делает local `ConnectionManager.emit`.

3. **WebSocket** — `GET/WS /v1/ws?ticket=…`:
   - ticket выдаётся `POST /v1/ws/tickets` (Bearer auth, TTL 60s, one-shot в Redis);
   - initial room `user:{org}:{user}`;
   - subscribe topic `conversation` + key = conversation UUID → ACL через active membership.

4. **Sync** — `GET /v1/sync/manifest` (доступные беседы + `lastEventSeq` / `historyFromSeq` / `lastReadMessageSeq`); delta уже есть как `GET …/events`.

5. **Тонкий добор Этапа 1 в том же срезе:**
   - `PATCH/DELETE …/messages/{id}` (tombstone + outbox);
   - `PUT …/read-cursor`.

## Не в этом срезе

- Presence / typing
- Media worker / thumbnails / avatars
- Snapshot body endpoint (есть только `snapshot_required` на events)
- Multi-tenant org claim

## Последствия

- Для live delivery нужны **два процесса**: API (+ in-process fanout) и outbox relay.
- At-least-once: клиент дедуплицирует по `event.id` / `eventSeq`.
- Compact WS payload; полный content — через HTTP history/events.
