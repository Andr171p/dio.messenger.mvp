# Status reports

Отчёты о реализации и ручной/автоматической проверке по итерациям. Не заменяют ADR/DEC: фиксируют **что сделано** и **как проверить**.

| Документ | Тема |
|---|---|
| [STATUS-media-mvp.md](STATUS-media-mvp.md) | Media MVP |
| [STATUS-stage2.md](STATUS-stage2.md) | Outbox relay + WebSocket + Sync (Этап 2) |
| [STATUS-backend-pre-frontend.md](STATUS-backend-pre-frontend.md) | Smoke перед фронтом (IAM + API + WS + media) |
| [STATUS-presence-typing-reactions.md](STATUS-presence-typing-reactions.md) | Presence / typing + reactions |
| [STATUS-snapshot-access-revoke.md](STATUS-snapshot-access-revoke.md) | Snapshot + access revoke |
| [STATUS-itsm-tickets.md](STATUS-itsm-tickets.md) | ITSM tickets |
| [STATUS-guests-policy.md](STATUS-guests-policy.md) | Guests, ConversationPolicy |
| [STATUS-mentions-pins-forward.md](STATUS-mentions-pins-forward.md) | Mentions, pins, forward ACL |
| [STATUS-search-fts.md](STATUS-search-fts.md) | Message search FTS |
| [STATUS-media-lifecycle.md](STATUS-media-lifecycle.md) | Media worker scan/validate |
| [STATUS-receipts-audit-retention.md](STATUS-receipts-audit-retention.md) | Receipts, audit, retention |
| [STATUS-p1-suggest-ticket.md](STATUS-p1-suggest-ticket.md) | P1 provision + ticket suggestion |
| [STATUS-threads-polls-scheduled.md](STATUS-threads-polls-scheduled.md) | Threads, polls, scheduled |
| [STATUS-hardening.md](STATUS-hardening.md) | Observability, load/fault checklist |
| [STATUS-verification.md](STATUS-verification.md) | P0–P8 verification report |
| [STATUS-frontend-mvp.md](STATUS-frontend-mvp.md) | Frontend MVP foundation (`messenger.web`) |

**Правило:** новый `STATUS-*.md` добавлять сюда в таблицу; ссылку на связанный DEC — относительную (`../decisions/...`).
