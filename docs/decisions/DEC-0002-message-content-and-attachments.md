# DEC-0002 — Message content и media

- **Статус:** Superseded by [DEC-0003](DEC-0003-media-module.md)
- **Дата:** 2026-11-22
- **Тип:** working decision

## Решение (историческое)

1. Содержимое сообщения — JSONB `content` с `text` + `attachments[{attachmentId, order}]`.
2. Модуль `attachments` + DioDesk-like presigned flow.

См. DEC-0003: модуль `media`, typed content blocks, `MediaAsset`.
