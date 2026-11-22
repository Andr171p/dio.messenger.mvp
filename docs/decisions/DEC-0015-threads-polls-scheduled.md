# DEC-0015 — Threads, polls, scheduled messages

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** ARCHITECTURE §7; Session 7; DEC-0009 guests/policy

## Решение

### Threads

1. Таблица `conversation_threads`: корень `root_message_id`, опциональный `title`.
2. `messages.thread_id` nullable FK на тред.
3. `SendMessageDTO.threadId` — ответы в треде; ACL = membership беседы + `history_from_seq` на root.
4. HTTP: `POST/GET …/threads`; durable `thread.created` + WS fanout.
5. `message.created` payload / WS compact включает `threadId`, если задан.

### Polls

1. Таблицы `polls`, `poll_options`, `poll_votes`.
2. `POST …/polls` создаёт message (`content.poll`) и poll row; guests **не** создают; **могут** голосовать.
3. `POST …/votes`, `POST …/close`; events `poll.created` / `poll.voted` / `poll.closed` в `conversation_events` + outbox.

### Scheduled messages

1. Таблица `scheduled_messages` (`payload` jsonb, `send_at`, `status`).
2. HTTP create / list (pending, своего sender) / cancel.
3. Worker `python -m src.infra.scheduled.worker` — `SKIP LOCKED` claim due → `send_message`.

## Последствия

- Миграция `h8b9c0d1e2f3` (`0008-threads-polls-scheduled`, after `g7a8b9c0d1e2`).
- Send path принимает optional `ThreadRepository`.
- Poll create потребляет два event seq (`message.created`, затем `poll.created`).