# Status: Presence / typing / reactions

- **Дата:** 2026-11-22
- **Решение:** [DEC-0005](../decisions/DEC-0005-presence-typing-reactions.md)
- **Миграция:** `c3d4e5f6a7b8` (`message_reactions`)

## Typing / presence (ephemeral)

| Команда WS | Поведение |
|---|---|
| `typing.started` / `typing.stopped` | ACL membership → Redis TTL → `typing.updated` в conversation room |
| `presence.ping` | heartbeat TTL |
| connect / disconnect | session counter → `presence.changed` в user room |

Throttle typing fanout: 1/s. Typing TTL 5s, presence TTL 60s (`REALTIME_*` env).

## Reactions (durable)

| HTTP | Назначение |
|---|---|
| `POST /v1/conversations/{id}/reactions` | `{ messageId, emoji }` → event + outbox |
| `DELETE …/messages/{messageId}/reactions/{emoji}` | снять свою |
| `GET …/messages/{messageId}/reactions` | summary `{ emoji, count, reactedByMe }` |

WS: `reaction.added` / `reaction.removed` через обычный outbox fanout.

## Проверено

`python scripts/e2e_smoke.py` — reaction + typing.started + message.created fanout OK.
