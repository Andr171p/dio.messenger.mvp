# DEC-0010 — Mentions, pins, forward

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** ARCHITECTURE §7, §12; Session 2 MVP backend; DEC-0009 guests/policy

## Решение

### Mentions

1. `SendMessageDTO`: optional `mentions: UUID[]`, `mentionAll: bool`.
2. В content JSON: `mentions: { principalIds, all }` (camelCase), только если есть упоминания.
3. Упомянутые principal должны быть active members той же беседы.
4. `mentionAll` — только `OWNER` / `ADMIN`; guests не могут `mentionAll`.
5. `message.created` payload включает `mentions`, если они есть в content.

### Pins

1. Таблица `message_pins` с `UNIQUE(conversation_id, message_id)`.
2. Domain events `message.pinned` / `message.unpinned` → conversation_events + outbox + WS fanout.
3. HTTP: `POST/DELETE/GET …/pins`; guests не pin.

### Forward

1. `SendMessageDTO.forwardedFrom: { conversationId, messageId }`.
2. ACL: active membership в source + `history_from_seq`; dest `allow_forwarding`; guests не forward.
3. Snapshot текста source (`blocks` type=text) в `content.forwardedFrom.text`.

## Последствия

- Миграция `f6a7b8c9d0e1` (`message_pins`).
- Send path принимает `ConversationPolicyRepository` для forward policy.
- Idempotency fingerprint учитывает mentions и forward ref.