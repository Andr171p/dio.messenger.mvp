# DEC-0011 — PostgreSQL FTS message search

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** [ARCHITECTURE.md](../ARCHITECTURE.md) §14; MVP Session 3

## Решение

### Индекс (projection на `messages`)

- Расширение `pg_trgm`.
- Функция `messenger_message_search_text(content)` — конкатенация `text` блоков из `content.blocks`.
- STORED-колонки: `search_text` (plain), `search_vector` (`to_tsvector('russian', …)`).
- GIN: `search_vector`, `search_text gin_trgm_ops`.
- Миграция: `g7a8b9c0d1e2` (`2026_11_22_0006-message_search_fts.py`), цепочка после `e5f6a7b8c9d0`.

### API

`GET /v1/search/messages`

Query: `q`, `conversationId`, `authorId`, `from`, `to`, `hasAttachment`, linked resource (`provider`, `resourceType`, `resourceId` — все три или ни одного).

### ACL

- Всегда `organization_id` актора.
- Без `conversationId`: join `conversation_members` (active) + `created_seq >= history_from_seq`.
- С `conversationId`: `require_active_membership` + тот же `history_from_seq`.
- Исключать soft-deleted messages (`deleted_at IS NULL`).
- Нет межтенантной выборки «с усечением на клиенте».

### Поисковая логика

- Текст: `websearch_to_tsquery('russian', q)` + `pg_trgm` (`%`) + fallback `ILIKE` для коротких фраз.
- Snippet: `ts_headline` (русская конфигурация).
- Ранжирование: `ts_rank_cd`, tie-break `created_seq DESC`.
- `q` опционален: без текста — фильтры + recency (при наличии `q` минимум 3 символа).
- Вложения: `message_media` или `media` block в content.
- Linked resource: JSONB `resource` block exact match.

## Не в этом срезе

- OpenSearch / отдельный search cluster
- Cross-conversation facets / aggregations
- Pagination cursor beyond `limit`
- Index update hooks вне STORED generated columns