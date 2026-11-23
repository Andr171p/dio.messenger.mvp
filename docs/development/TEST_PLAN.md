# DIO Messenger — Testing & SLO Verification Plan

> **Цель:** доказать durability, ACL isolation, offline correctness и latency на нескольких инстансах.  
> **Спецификация:** [ARCHITECTURE.md](ARCHITECTURE.md) · [Outbox ADR](../../../../Downloads/DIO_Messenger_docs/docs/adr/ADR-0003-transactional-outbox-and-realtime.md)

## 1. Категории

- **Unit:** чистые доменные функции, policy evaluation, state machines, merge/gap logic, retries.
- **Integration:** реальные PostgreSQL, RabbitMQ, Redis, S3 mock/test environment; несколько API/WS/worker-инстансов; транзакции и дедуп.
- **E2E:** browser clients, несколько учётных записей/организаций, offline, вкладки/устройства, embedded UI.
- **Load:** измерение p95/p99, hot conversations, Redis fanout, WS connections, outbox backlog, search.
- **Security:** отмечаются тест-кейсами **внутри** соответствующих unit/integration/e2e/load, не обязательно отдельной папкой.

## 2. Core correctness matrix

| ID | Категория | Сценарий | Ожидаемое |
|---|---|---|---|
| M-001 | Integration | Message, Event и Outbox записываются | Все зафиксированы атомарно |
| M-002 | Integration | Transaction rollback | Нет частично сохранённого Message/Event/Outbox |
| M-003 | Integration | Одновременная отправка в одну беседу | Уникальный последовательный `seq`, корректный порядок |
| M-004 | Integration | Два раза один `client_message_id` | Одно сообщение, согласованный ответ |
| M-005 | Integration | Повтор idempotency key с другим payload | Конфликт, без тихого изменения сообщения |
| M-006 | Integration | Pagination while new messages arrive | Нет пропусков/дублей при keyset |
| M-007 | Integration | Edit/delete старого сообщения | Новый sync event, стабильный `created_seq` |
| M-008 | Integration | Реакции от нескольких пользователей | Уникальность, корректное add/remove |
| M-009 | Integration | Неавторизованный доступ к чату | Deny без утечки текста/metadata |
| M-010 | Integration | Участник исключён в момент отправки | Сервер проверяет право при операции, запрос блокируется при актуальном запрете |

## 3. Outbox & transport resilience

| ID | Категория | Сценарий | Ожидаемое |
|---|---|---|---|
| O-001 | Integration | Убить API после COMMIT, до ACK | Retry не создаёт дубль; событие durable |
| O-002 | Integration | Потеря NOTIFY | Polling fallback публикует событие |
| O-003 | Integration | Рестарт listener и backlog | Pending events вычитываются после восстановления |
| O-004 | Integration | Worker crash после broker confirm, до mark processed | Повтор безопасен, consumer идемпотентен |
| O-005 | Integration | RabbitMQ недоступен | Outbox backlog сохраняется, затем отправляется |
| O-006 | Integration | Redis Pub/Sub теряет уведомление | Клиент восстанавливает через Sync API |
| O-007 | Integration | Multi-worker `SKIP LOCKED` | Обработка без одновременного захвата и без потери; дубликаты допустимы |
| O-008 | E2E | Event 105 пришёл до 104 | Буферизация + gap fetch, cursor не перепрыгивает |
| O-009 | Load | NOTIFY burst / listener slow | Не переполняются ресурсы, backlog drain и fallback |

## 4. Offline frontend / Sync Engine

| ID | Категория | Сценарий | Ожидаемое |
|---|---|---|---|
| F-001 | E2E | Открыть ранее загруженный чат offline | История отрендерена из IndexedDB |
| F-002 | E2E | Отправить offline, перезагрузить страницу | Сообщение и outbox command сохранены |
| F-003 | E2E | Восстановить сеть | Один canonical Message после retry |
| F-004 | E2E | Потерять HTTP response после commit | Нет дубликата после retry |
| F-005 | E2E | Две вкладки обрабатывают одну очередь | Координация + серверная дедупликация |
| F-006 | E2E | Пропущены edit/delete/reaction во время offline | Delta sync обновляет правильную локальную проекцию |
| F-007 | E2E | Истёк event retention | Snapshot reset без потери локального unsent outbox |
| F-008 | E2E | Изменили organisation/user в браузере | Не отображается кеш прежней сессии |
| F-009 | E2E | Участника исключили, пока он был offline | После reconnect доступ аннулирован, локальный кеш обрабатывается по policy |
| F-010 | E2E | Длинная история + images + prepend | Стабильное положение скролла и virtualized rendering |

## 5. Security and enterprise

| ID | Категория | Сценарий | Ожидаемое |
|---|---|---|---|
| S-001 | Integration security | Cross-tenant read/search/forward | Deny |
| S-002 | Integration security | Угаданный room UUID при WS subscribe | Deny |
| S-003 | Integration security | Guest запрашивает внутреннее ITSM preview | Данные не раскрываются |
| S-004 | Integration security | Forward из закрытой беседы | Проверяются политики обеих сторон и права на источник |
| S-005 | Integration security | Attachment not scanned/unauthorized | Download deny |
| S-006 | E2E security | Изменение политики AI, файлов, edit window | UI обновляется, API блокирует запрещённое |
| S-007 | Unit/Integration security | HTML/XSS/URL injection в message content | Safe rendering и validation |
| S-008 | Load security | WS connection flood / slow consumer / frame spam | Rate/concurrency limits и backpressure удерживают сервис |
| S-009 | Integration security | Membership revoked after WS subscribe | Дальнейшая передача запрещённого контента прекращена |

## 6. Performance benchmark plan

**Workloads:**

1. Личные чаты: частые маленькие сообщения; одновременные отправки с двух устройств.
2. Группы: десятки активных авторов, тысячи читающих, разные online/offline mixes.
3. Hot conversation: высокая конкуренция на один `conversation.last_event_seq`.
4. WebSocket fanout: много подключений, часть клиентов медленные/рвут соединения.
5. Search: realistic corpus, русский язык, ACL filters и фильтр по нескольким беседам.
6. Reconnect storm: множество клиентов одновременно восстанавливают snapshot/deltas.

**Метрики:** p50/p95/p99 send ACK, recipient delivery, outbox lag, DB txn time, WS queue depth, sync recovery time, backend CPU/memory/DB IO, RabbitMQ backlog, Redis pressure.

**Обязательное сравнение Outbox:** polling 500 мс vs polling 50 мс vs LISTEN/NOTIFY + fallback polling 500 мс. Записывать фактические результаты вместо предположений.

## 7. Определение результатов

- Отчёт содержит версию стенда/конфигурацию, объём данных, profile нагрузки и метод измерения.
- Проблемы correctness/security блокируют релиз независимо от p95.
- SLO считаются достигнутыми только при измерении согласованным инструментарием и реалистичной нагрузкой.
- Latency не подменяет durability: sender ACK vs recipient application — разные измерения.
