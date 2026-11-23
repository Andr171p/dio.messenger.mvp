# Status: Media MVP (ручное тестирование)

- **Дата:** 2026-11-22
- **Решение:** [DEC-0003](../decisions/DEC-0003-media-module.md)
- **Миграция:** `b2c3d4e5f6a7` (`attachments` → `media_*`)
- **Бакет S3:** `messenger-media` (RustFS :9010)

Документ для ручной проверки текущего backend перед следующим шагом.

---

## Что сделано

1. Модуль **`attachments` удалён**, вместо него **`media`**.
2. Conversation `builders.py` убран — ответы через `DTO.model_validate(..., from_attributes=True)`.
3. Direct S3 upload/download через DDF `S3Client` (presigned PUT/GET).
4. Сообщения принимают **content blocks** (`text` / `media`), не `text` + `attachmentIds`.
5. Связь сообщение↔файл — таблица `message_media` + JSONB `content.blocks`.

### Что сознательно не сделано (следующий шаг)

- Antivirus / Media Worker / статусы `processing`
- Thumbnails / preview variants
- Avatar API (`PUT/DELETE /conversations/{id}/avatar`)
- CDN / `MediaAccessProvider`
- Cleanup orphan staging по TTL
- Отдельная таблица `media_uploads` (pending asset = upload session)

---

## Как устроено

```text
Client                    Messenger API                 RustFS (S3)
  |                            |                            |
  |-- POST /v1/media/uploads ->|                            |
  |   (ACL + policy + PENDING) |                            |
  |<- uploadId + uploadUrl ----|                            |
  |                            |                            |
  |-------------- PUT file bytes (presigned) -------------->|
  |                            |                            |
  |-- POST .../complete ------>|-- head_object ------------>|
  |   status → READY           |<- size/contentType --------|
  |                            |                            |
  |-- POST /messages (blocks) >|  check READY + link        |
  |                            |  message_media + outbox    |
  |                            |                            |
  |-- POST /media/{id}/access >|  membership ACL            |
  |<- short-lived GET url -----|-- create_download_url ---->|
  |-------------- GET object ------------------------------>|
```

### Домен

| Сущность | Смысл |
|---|---|
| `MediaAsset` | Файл: org, owner, filename, content_type, size, status, target, `meta` |
| `MediaObject` | S3 key + role (`staging` → после complete `original`) |
| `UploadTarget` | `type: message \| conversation_avatar` + `conversationId` |

Статусы MVP: `pending` → `uploaded` → сразу `ready` (без scanning).

`meta` в БД — JSONB. Типы `ImageMeta` / `VideoMeta` / `AudioMeta` / `DocumentMeta` живут в application (`metadata.py`); на MVP после complete `meta` обычно пустой.

### Слои

```text
domain/media/          models, types, exceptions
application/media/     commands, queries, dtos, policies, metadata
application/messaging/ content blocks + send path
infra/database/        media_assets, media_objects, message_media
api/routers/user/media.py
```

Нет `ports.py`: ACL в use case → прямой `S3Client`.

---

## API (camelCase)

Auth: `Authorization: Bearer <token>` (DioDesk IAM на `localhost:8001`).

### Media

| Метод | Путь | Назначение |
|---|---|---|
| `POST` | `/v1/media/uploads` | Создать upload + presigned PUT |
| `POST` | `/v1/media/uploads/{uploadId}/complete` | Проверить объект в S3 → `READY` |
| `DELETE` | `/v1/media/uploads/{uploadId}` | Отменить pending upload |
| `GET` | `/v1/media/{assetId}` | Метаданные asset |
| `POST` | `/v1/media/{assetId}/access` | Короткий download URL (`Cache-Control: no-store`) |

**Создать upload**

```http
POST /v1/media/uploads
Content-Type: application/json

{
  "filename": "photo.jpg",
  "contentType": "image/jpeg",
  "size": 12345,
  "target": {
    "type": "message",
    "conversationId": "<uuid>"
  }
}
```

Ответ: `uploadId`, `asset`, `uploadUrl`, `expiresIn`.  
`uploadId == asset.id`.

**PUT в S3** — на `uploadUrl`, заголовок `Content-Type` как в запросе.

**Complete** — без тела (MVP).

**Access**

```http
POST /v1/media/{assetId}/access
Content-Type: application/json

{ "role": "original" }
```

Роли: `original` | `thumbnail` | `preview` (пока обычно есть только `original`).

### Messages

```http
POST /v1/conversations/{conversationId}/messages

{
  "clientMessageId": "<uuid>",
  "blocks": [
    { "type": "text", "text": "Смотри файл" },
    { "type": "media", "assetId": "<uuid>" }
  ],
  "replyToId": null
}
```

Правила:

- хотя бы один block;
- media только `READY`, `target.type=message`, тот же `conversationId`, владелец = sender;
- дубликаты `assetId` запрещены;
- лимит media на сообщение: `MESSAGING_MAX_MEDIA_PER_MESSAGE` (по умолчанию 10).

В БД `messages.content`:

```json
{
  "blocks": [
    { "type": "text", "text": "Смотри файл" },
    { "type": "media", "assetId": "..." }
  ]
}
```

---

## Чеклист ручной проверки

1. Docker: Postgres, Redis, RabbitMQ, RustFS; бакет `messenger-media` (`docker compose run --rm storage-init`).
2. DioDesk IAM на `:8001`, Messenger API запущен, миграции на `b2c3d4e5f6a7`.
3. Создать group/direct conversation.
4. `POST /v1/media/uploads` с `target.type=message`.
5. PUT файла по `uploadUrl`.
6. `POST .../complete` → `status: ready`.
7. `POST .../messages` с text + media blocks → 201, в payload есть `blocks`.
8. `POST /v1/media/{id}/access` → URL; GET по URL отдаёт файл.
9. Негатив: complete без PUT; send с `pending` asset; access без membership; upload с чужим `conversationId`.

### Политика upload (defaults)

- max size: 50 MiB (`MEDIA_MAX_UPLOAD_BYTES`)
- upload URL TTL: 3600 s
- download URL TTL: 180 s
- MIME: jpeg/png/webp/gif, pdf, mp4, mpeg/ogg/webm audio, `application/octet-stream`

---

## Env

| Переменная | Пример |
|---|---|
| `S3_BUCKET` | `messenger-media` |
| `S3_ENDPOINT_URL` | `http://localhost:9010` |
| `MESSAGING_MAX_MEDIA_PER_MESSAGE` | `10` |
| `MEDIA_MAX_UPLOAD_BYTES` | `52428800` |
| `MEDIA_DOWNLOAD_URL_EXPIRES_IN` | `180` |

`S3_ATTACHMENTS_BUCKET` больше не используется.

---

## Файлы для ориентира

- `messenger.back/src/application/media/commands.py` — upload / complete / access
- `messenger.back/src/application/messaging/content.py` — сборка blocks
- `messenger.back/src/api/routers/user/media.py` — HTTP
- `messenger.back/migrations/versions/2026_11_22_0002-replace_attachments_with_media.py`
