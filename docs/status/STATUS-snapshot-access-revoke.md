# Status: Snapshot body + WS revoke on kick

- **Дата:** 2026-11-22
- **Решение:** [DEC-0006](decisions/DEC-0006-snapshot-and-access-revoke.md)

## Сделано

| Компонент | Детали |
|---|---|
| Snapshot API | `GET /v1/conversations/{id}/snapshot?messageLimit=` |
| Membership durable | `member.joined` / `member.removed` → ConversationEvent + outbox |
| Fanout | conversation room; при remove — ещё user room + `access.revoked` |
| Local revoke | `WsSessionRegistry` + `MessengerConnectionManager.emit` снимает subscribe/leave на каждом API-инстансе через Redis |

## Smoke

Расширен `messenger.back/scripts/e2e_smoke.py`: snapshot + leave → `member.removed` + `access.revoked`.

## Следующее

Интеграция с заявками (ITSM / tickets).
