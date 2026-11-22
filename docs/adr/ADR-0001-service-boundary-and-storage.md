# ADR-0001 — Service boundary и PostgreSQL для MVP

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Контекст:** [ARCHITECTURE.md](../ARCHITECTURE.md)

## Контекст

DIO Messenger должен быть встроен в DIO Service-Desk, но иметь потенциал самостоятельного продукта внутри DIOS. Критические операции связаны: conversation membership, messages, policies, sync events, outbox. Планируется возможное использование Cassandra для больших объёмов истории сообщений.

## Решение

- Отдельный **Messenger Service** с собственной PostgreSQL и API, не внутренний модуль DIO Desk.
- **Модульный монолит в пределах сервиса**: логические bounded modules, один набор доменных контрактов и транзакций; без отдельных микросервисов для reactions/messages/conversations.
- PostgreSQL хранит conversations, messages, memberships, read cursors, sync events и outbox.
- Отдельный процесс worker обрабатывает outbox/integrations, кодовая база общая с API.
- S3 для файлов, Redis для transient state, RabbitMQ для asynchronous events.
- Cassandra и внешнюю поисковую инфраструктуру **не добавлять до измеренной необходимости**.

## Причины

- PostgreSQL обеспечивает атомарное сохранение Message + Sync Event + Outbox.
- Упрощает поддержку, observability и эксперименты с сервисом в раннем production.
- Легче реализовать IAM/ITSM ACL и нет распределённых транзакций между микросервисами внутри Messenger.

## Последствия и trade-offs

- Горячие беседы могут создавать contention на per-conversation seq. Это предмет нагрузочного тестирования.
- При миграции в Cassandra не удастся сохранить атомарность PostgreSQL-транзакции простой подменой репозитория; необходим отдельный архитектурный проект.
- Внешние IAM и DIO Desk интеграции — через API/events, не общая БД.

## Не выбранные альтернативы

- Cassandra с MVP: высокие операционные и consistency costs без доказанного выигрыша.
- Сервис на каждую сущность: высокая распределённая сложность на старте.
- Messenger как модуль DIO Desk: мешает самостоятельности продукта и общей архитектуре экосистемы.
