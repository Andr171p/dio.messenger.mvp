# Status: PostgreSQL FTS search

- **Дата:** 2026-11-22
- **Решение:** [DEC-0011](decisions/DEC-0011-message-search-fts.md)
- **Миграция:** `g7a8b9c0d1e2` (`2026_11_22_0006-message_search_fts.py`)

## HTTP

| Endpoint | Назначение |
|---|---|
| `GET /v1/search/messages` | ACL-safe FTS по сообщениям |

Фильтры: `q`, `conversationId`, `authorId`, `from`, `to`, `hasAttachment`, `provider` + `resourceType` + `resourceId`.

Ответ: `{ items: [{ id, conversationId, senderId, createdSeq, createdAt, snippet, rank }], limit }`.

## Слои

| Слой | Файлы |
|---|---|
| Application | `src/application/search/` |
| Infra | `src/infra/database/repositories/search.py` |
| API | `src/api/routers/user/search.py` |

## Проверено

- Unit: `tests/unit/test_search_content.py` (extract текста из blocks).