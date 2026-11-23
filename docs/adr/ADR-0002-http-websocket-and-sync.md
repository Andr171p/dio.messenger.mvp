# ADR-0002 — HTTP + WebSocket + durable synchronization

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Контекст:** [ARCHITECTURE.md](../architecture/ARCHITECTURE.md), разделы 7–11

## Контекст

WebSocket-события могут пропадать при отключении сети, рестарте пода, перегрузке или использовании Redis Pub/Sub. Надёжная синхронизация не должна зависеть от непрерывности одного соединения.

## Решение

- HTTP API для отправки команд, истории, поиска, начального state, recovery и sync.
- WebSocket (DDF Realtime) для live notifications, typing, presence, reactions и обновлений.
- Durable per-conversation `ConversationEvent.seq` хранится в PostgreSQL и меняется атомарно с доменным состоянием.
- Клиент держит последний **непрерывно применённый** seq; по gap вызывает `GET /conversations/{id}/events?after_seq=`.
- `GET /sync/manifest` помогает согласовать доступные беседы/их версии; revocation/membership updates учитываются отдельно.
- Если delta retention истёк — явный `snapshot_required`, затем безопасный resync.
- Event stream допускает повторную и out-of-order доставку; `event_id` и `seq` обязательны.
- Redis Pub/Sub используется только как быстрый межинстансный transport, не durable source.

## Инварианты

1. Sender ACK приходит только после commit.
2. `ConversationEvent` и изменение сущности фиксируются в одной транзакции.
3. `seq` не назначается таким способом, который позволяет невидимым более ранним commit появиться позднее уже подтверждённого cursor.
4. Клиент не перескакивает через последовательность с пропущенным событием.
5. Чтение событий фильтруется текущими правами и правилами history visibility.

## Consequences

- Сложнее клиентский Sync Engine, но связь выдерживает offline и multi-device.
- Нужен retention/snapshot lifecycle и согласованный протокол подписки/initial load, чтобы не было гонки между HTTP snapshot и WSS.
- Per-conversation sequencing может ограничивать throughput отдельных горячих бесед.
