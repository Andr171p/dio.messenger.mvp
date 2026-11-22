# DEC-0003 — Media module и content blocks

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Supersedes:** [DEC-0002](DEC-0002-message-content-and-attachments.md)

## Решение

1. Вложения живут в модуле **`media`**, не в `attachments` и не как nullable-поля `Message`.
2. **`MediaAsset`** — самостоятельный объект файла (`status`, `content_type`, `size`, `meta` JSONB). Типизированные `ImageMeta` / `VideoMeta` / … — в **application** (Pydantic); в домене — `meta: dict | None`.
3. Физические ключи S3 — в **`media_objects`** (`role`: staging/original/thumbnail/preview). Presigned URL не хранятся.
4. Назначение загрузки — discriminated union с полем **`type`** (`message` | `conversation_avatar`), не `kind`.
5. Содержимое сообщения — JSONB `content.blocks` (typed content blocks: `text` / `media`). FK-связи — таблица **`message_media`**.
6. API: `/v1/media/uploads`, `.../complete`, `DELETE .../uploads/{id}`, `GET /v1/media/{id}`, `POST /v1/media/{id}/access`.
7. Upload: direct **presigned PUT** через DDF `S3Client`; finalize через `head_object`; MVP без scanning/worker — после complete сразу `READY`.
8. Без `ports.py` / `MediaAccessProvider` на MVP: ACL в use case, затем прямой вызов `S3Client`.
9. Отдельная таблица `media_uploads` на MVP не нужна: pending `MediaAsset` = upload session (`upload_id == asset_id`).

## Последствия

- В сообщение можно слать только `READY` media с `target_type=message` того же conversation.
- Cleanup orphan staging/TTL — отдельная задача.
- Antivirus / variants / CDN access abstraction — позже.
