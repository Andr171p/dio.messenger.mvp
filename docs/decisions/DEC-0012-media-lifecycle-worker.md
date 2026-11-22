# DEC-0012 — Media lifecycle worker (upload → scan → ready)

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** ARCHITECTURE §11 attachments; Session 4 implementation plan

## Решение

1. **`complete_upload`** только подтверждает объект в S3 и переводит asset в `uploaded` (staging → `original`), **без** `ready`.
2. Отдельный worker (`python -m src.infra.media.worker`) poll + `FOR UPDATE SKIP LOCKED` забирает `uploaded` (и застрявшие `scanning`).
3. Переходы: `uploaded` → `scanning` → `ready` | `rejected`.
4. Validation (MVP stubs): stub antivirus (EICAR), magic-byte sniff vs declared `content_type`, опциональный thumbnail object (stub key, без Pillow).
5. При `rejected` — `meta.rejection` с `reason` и опциональным `code`.
6. Сообщения с media block: `ensure_attachable` по-прежнему требует `ready`.

## Последствия

- E2E / smoke должен дождаться worker или запускать его отдельным процессом.
- Клиент опрашивает `GET /v1/media/{id}` после complete, пока status не `ready` или `rejected`.