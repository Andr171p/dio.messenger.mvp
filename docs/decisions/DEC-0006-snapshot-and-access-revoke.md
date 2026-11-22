# DEC-0006 — Snapshot body + WS revoke on kick

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** ADR-0002; CODE_STANDARDS §8.4 / §8.8; хвост Этапа 2

## Snapshot

После `snapshot_required` на `GET …/events` клиент запрашивает:

`GET /v1/conversations/{conversationId}/snapshot?messageLimit=100`

Ответ:

- `conversation` — id, type, title, `lastEventSeq`
- `membership` — `historyFromSeq`, `lastReadMessageSeq`
- `messages` — последние N доступных сообщений (с учётом `history_from_seq`), ascending по `createdSeq`
- `messagesTruncated` — true, если есть более старые сообщения (дальше — `GET …/messages?beforeSeq=`)
- `snapshotEventSeq` — = `lastEventSeq` на момент snapshot (дальше delta: `events?afterSeq=snapshotEventSeq`)

Не стирает client local Outbox.

## Access revoke

При kick / leave (`remove_member`):

1. В той же TX: `left_at`, `ConversationEvent` `member.removed`, outbox domain event.
2. Fanout: conversation room + user room кикнутого.
3. На каждом API-инстансе: для локальных WS-сессий кикнутого user — `unsubscribe` conversation + `leave` room; клиенту уходит `access.revoked`.

`member.joined` при add — аналогично durable + fanout (без revoke).
