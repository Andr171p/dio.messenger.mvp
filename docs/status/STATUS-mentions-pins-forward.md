# Status: Mentions / pins / forward

- **Дата:** 2026-11-22
- **Решение:** [DEC-0010](../decisions/DEC-0010-mentions-pins-forward.md)
- **Миграция:** `f6a7b8c9d0e1` (`message_pins`)

## Mentions (send path)

| Правило | Enforcement |
|---|---|
| `mentions[]` | active members only |
| `mentionAll` | owner/admin; guests denied |
| Storage | `content.mentions` |
| Event | `message.created` payload `mentions` |

## Pins (durable)

| HTTP | Назначение |
|---|---|
| `POST /v1/conversations/{id}/pins` | `{ messageId }` → event + outbox |
| `DELETE …/messages/{messageId}/pins` | снять pin |
| `GET …/pins` | список pins в беседе |

WS: `message.pinned` / `message.unpinned` через outbox fanout. Guests не pin.

## Forward (send path)

| ACL | Поведение |
|---|---|
| Source membership + `history_from_seq` | read forwarded message |
| Dest `allow_forwarding` | policy check |
| Guests | denied |
| Snapshot | `content.forwardedFrom.{ conversationId, messageId, text }` |

## Проверено

`pytest tests/unit/test_mentions_pins_forward.py` — content enrichment, pin domain, fanout mapping, fingerprint.