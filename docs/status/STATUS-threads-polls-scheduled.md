# Status: Threads / polls / scheduled

- **Дата:** 2026-11-22
- **Решение:** [DEC-0015](../decisions/DEC-0015-threads-polls-scheduled.md)
- **Миграция:** `h8b9c0d1e2f3` (`0008-threads-polls-scheduled`)

## Threads

| HTTP | Назначение |
|---|---|
| `POST /v1/conversations/{id}/threads` | `{ rootMessageId, title? }` |
| `GET …/threads` | список (фильтр `history_from_seq` на root) |
| `POST …/messages` | optional `threadId` |

WS: `thread.created`; `message.created` с `threadId`.

## Polls

| HTTP | Назначение |
|---|---|
| `POST …/polls` | message + poll (staff/member) |
| `POST …/polls/{pollId}/votes` | `{ optionIds[] }` (guests OK) |
| `POST …/polls/{pollId}/close` | creator или owner/admin |

Events: `poll.created` / `poll.voted` / `poll.closed` + outbox fanout.

## Scheduled

| HTTP | Назначение |
|---|---|
| `POST …/scheduled-messages` | `{ sendAt, message: SendMessageDTO }` |
| `GET …/scheduled-messages` | pending, только свои |
| `DELETE …/scheduled-messages/{id}` | cancel |

Worker: `python -m src.infra.scheduled.worker`.

## Проверено

`pytest tests/unit/test_threads_polls_scheduled_domain.py` — domain + fanout mapping.