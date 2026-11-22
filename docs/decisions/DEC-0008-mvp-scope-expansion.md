# DEC-0008 — Расширение базового MVP scope

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Тип:** working decision
- **Контекст:** [ARCHITECTURE.md](../ARCHITECTURE.md) §2; запрос продукта перенести MVP+ в Core

## Решение

В **MVP Core** дополнительно входят:

1. Автоматическое создание incident room по P1 (идемпотентный provision chat ↔ ticket).
2. Рекомендация создать заявку из клиентского сообщения (с явным подтверждением; без silent auto-create).
3. Topics/threads, polls, scheduled messages.
4. Avatars и базовые media variants (thumbnail/preview) в media lifecycle.

MVP+ остаётся: sync черновиков между устройствами, reminders/каналы сверх threads, voice/AI summarization, LLM semantic ranking.

## Последствия

- Этап 4 Implementation Plan расширен соответствующими задачами.
- Оценка объёма MVP и пилота растёт; ядро send/sync не ослабляется.
