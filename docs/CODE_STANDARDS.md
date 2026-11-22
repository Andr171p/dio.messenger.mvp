# DIO Messenger — Code & Implementation Standards (MVP)

> **Статус:** нормативный engineering guide для реализации MVP · редакция 1.1  
> **Дата:** 2026-11-22  
> **Аудитория:** backend, frontend, review, QA, разработчики интеграций  
> **Связанные документы:** [Architecture](ARCHITECTURE.md) · [Implementation Plan](IMPLEMENTATION_PLAN.md) · [Test Plan](TEST_PLAN.md) · [ADR-0002: HTTP/WS/Sync](adr/ADR-0002-http-websocket-and-sync.md) · [ADR-0003: Outbox](adr/ADR-0003-transactional-outbox-and-realtime.md)

Этот документ отвечает на вопрос **«как писать DIO Messenger, а не только что реализовывать»**. Code style адаптирован по реальным примерам `kb.back` из [Andr171p/dio.kb](https://github.com/Andr171p/dio.kb): `application/auth/dtos.py`, `application/auth/exceptions.py`, `api/dependencies/auth.py`, `api/dependencies/db.py`. Это **ориентир по стилю**, а не зависимость от кода KB: Messenger реализует собственные модули. Его цель — качественный, поддерживаемый MVP: явные границы и гарантии при разумной сложности, без преждевременного абстрагирования.

> В примерах используются **иллюстративные контракты**, а не утверждение о точных сигнатурах существующего DDF. Перед копированием примеров необходимо сопоставить их с текущими API DDF (`serve_websocket`, `RealtimePublisher`, `SqlAlchemyOutboxStore`, auth dependencies). Конкретная схема OpenAPI/WS/DB должна быть утверждена отдельно.

## 1. Язык требований и принципы

- **MUST / ЗАПРЕЩЕНО** — блокирует merge/release при нарушении.
- **SHOULD / РЕКОМЕНДУЕТСЯ** — default, отклонение фиксируется в PR с причиной.
- **MAY / ДОПУСТИМО** — оптимизация по измерениям или явным требованиям.

### Основные правила

1. **Correctness > эффектная архитектура.** Никакая оптимизация latency не должна менять значение ACK, создавать потерю подтверждённых сообщений или обходить ACL.
2. **Simple, but not naive.** MVP допускает менее универсальные решения, но не временные хаки в критических гарантиях.
3. **Domain-first, framework-last.** Domain остаётся независимым от FastAPI, SQLAlchemy, Pydantic DTO, DDF adapters, Redis и RabbitMQ. Application по умолчанию использует функции и Pydantic DTO; явная `AsyncSession` допустима как практичный transaction boundary, если бизнес-логика не утекает в API.
4. **Explicit dependencies.** Зависимости передаются через конструктор/параметры и собираются в composition root, а не ищутся через глобальные registry/service locator.
5. **One owner for state.** Источник истины сообщений — PostgreSQL; WS/Redis — сигнал доставки; IndexedDB — локальная проекция; TanStack Query — orchestration HTTP, не второй authoritative store.
6. **Secure by construction.** Tenant isolation, permission checks, idempotency, offline reconciliation, logging hygiene — часть каждого use case, а не отдельный «security sprint».
7. **Prefer functions by default.** Для единичных use cases — функции с явными аргументами; `DBSession`/`OutboxDep` разрешаются в API; классы сервисов — когда действительно есть несколько связанных методов, общие зависимости или состояние, как в IAM-клиенте. Не создавать `*Handler`/`execute()` по шаблону.
8. **Design for failure.** Таймаут, потерянный ответ, дублированный event, рестарт worker, reconnect — обычные сценарии, а не исключительные.
9. **Measure before optimizing.** Cassandra, fast path, bulk batching, новый брокер и дополнительная очередь вводятся только после нагрузочных измерений.

### Что считать «некачественным MVP»

- Отправка «успешна», когда сообщение ещё не записано надёжно.
- Запись Message успешна, но ConversationEvent/Outbox потеряны.
- Корректность зависит от постоянно открытого WebSocket.
- Повтор POST создаёт дубликат, а повтор WS event ломает историю.
- Роутер обходит application-layer, читает чужую таблицу или доверяет `organization_id` из тела клиентского запроса.
- После исключения из чата клиент продолжает получать полный текст сообщений.
- Ошибки транслируются наружу как traceback/SQL exception.
- Любой бизнес-процесс «надёжно» запускается через `asyncio.create_task()` без устойчивой очереди.

---

## 2. Stack и общие стандарты

**Backend:** Python 3.13+, FastAPI, Pydantic v2 (DTO в `application`), dataclasses (domain/value objects), SQLAlchemy async + asyncpg, Alembic, DDF, PostgreSQL, RabbitMQ, Redis, S3-compatible storage.  
**Frontend:** TypeScript (strict), React, Vite, TanStack Query, Dexie/IndexedDB, Zustand, TanStack Virtual.  
**Quality:** Ruff lint/format, mypy, pytest, OpenAPI contract tests, integration/e2e/load tests, CI.

Рекомендуемые установки:

- Python type hints обязательны на публичных и внутренних функциях, особенно на async boundaries. `Any` допускается только на неустранимых адаптерных границах и документируется.
- Использовать `async` **там, где есть I/O**. Чистые доменные операции — обычные `def`.
- Публичные параметры — keyword-only там, где это уменьшает риск перепутать близкие значения (`*, conversation_id: UUID, actor_id: UUID`).
- Для неизменяемых domain value objects: `@dataclass(frozen=True, slots=True)`; для агрегатов — dataclass/обычный класс по необходимости, без насильственного `frozen=True`.
- Использовать `Enum` для закрытых наборов значений; не рассыпать magic strings по слоям.
- Исключения — осмысленные и типизированные (`ConversationNotFound`, `PermissionDenied`, `MessageEditWindowExpired`), без `raise Exception("...")`.
- Конфигурация — типизированная, из окружения/секретов; не читать `os.getenv()` в бизнес-функциях.
- Секреты, токены, текст сообщений, приватные вложения **не писать** в application logs и telemetry spans.
- Не делать в сервисе произвольные runtime migrations на старте приложения; схемы меняются через Alembic как отдельный deploy step.
- Название технического слоя: **`infra/`**, не `infrastructure/`; namespace приложения — `src` (как в KB), без обязательной обёртки `src/messenger/`.
- DTO (request/response, auth и application-операции) хранятся в `application/<module>/dtos.py`; у `api/` **нет** `schemas/`. Использовать `alias_generator=to_camel` и единый `camelCase` wire-контракт.
- Для понятных ограничений предпочтительны встроенные Pydantic-типы (`PositiveInt`, `NonNegativeInt`, `EmailStr`, `AwareDatetime`, `UUID`); для длины/диапазонов — локальный `Field` там, где это необходимо.
- `field_validator`/`model_validator` не вводить для одноразовых правил создания объекта: их лучше проверять явными чистыми функциями в соответствующем use case. Валидаторы допустимы для **инварианта каждой десериализации**, если это обосновано.
- `api/dependencies/` — папка со сфокусированными файлами (`auth.py`, `db.py`, `messaging.py`, `realtime.py`), а не глобальный `dependencies.py`. В композиции использовать `Annotated[T, Depends(...)]`-алиасы.
- Для совместимости с `kb.back` исключения application-слоя могут наследоваться от `ddf.application.exceptions.ApplicationError` с устойчивыми `status_code`/`error_code`. Содержимое доменной модели не должно зависеть от HTTP.
- Не смешивать декларацию dependencies и прикладную логику: FastAPI Depends работает в API-адаптере; чистые функции application принимают уже разрешённые объекты явно.

## 3. Структура backend: стиль `kb.back`, адаптированный под Messenger

Один deployable Messenger Service, `src/` — корень Python-пакета, `infra/` — технические реализации. Файлы создаются по мере появления сценариев: ниже **ориентир**, не требование сделать пустые директории.

```text
src/
├── api/
│   ├── routers/
│   │   ├── user/
│   │   │   ├── conversations.py
│   │   │   ├── messages.py
│   │   │   ├── memberships.py
│   │   │   ├── search.py
│   │   │   └── sync.py
│   │   ├── service/
│   │   │   └── context_conversations.py
│   │   ├── admin/
│   │   │   └── conversation_policies.py
│   │   ├── websocket/
│   │   │   ├── connection.py
│   │   │   └── subscriptions.py
│   │   └── system/
│   │       └── health.py
│   ├── dependencies/
│   │   ├── auth.py
│   │   ├── db.py
│   │   ├── messaging.py
│   │   └── realtime.py
│   └── errors.py
├── application/
│   ├── auth/
│   │   ├── dtos.py
│   │   └── exceptions.py
│   ├── conversations/
│   │   ├── dtos.py
│   │   ├── services.py          # только при наличии связанных операций
│   │   └── exceptions.py
│   ├── messaging/
│   │   ├── dtos.py
│   │   ├── commands.py          # функции send/edit/delete (или разнести по файлам)
│   │   ├── queries.py
│   │   ├── repositories.py      # узкие Protocol, если полезны
│   │   └── exceptions.py
│   ├── memberships/
│   ├── receipts/
│   ├── sync/
│   ├── search/
│   ├── policies/
│   └── integrations/
├── domain/
│   ├── conversations/
│   ├── messages/
│   ├── memberships/
│   └── policies/
├── infra/
│   ├── database/
│   │   ├── connection.py
│   │   ├── models/
│   │   └── repositories/
│   ├── outbox/
│   ├── realtime/
│   ├── cache/
│   ├── storage/
│   └── services/
│       ├── iam/           # Legacy DIO Desk auth/integrations
│       └── itsm/
├── main.py
└── app.py                     # опционально: сборка FastAPI и lifespan
```

**Никакого `api/schemas`.** Pydantic DTO живут в `application`, а `api/routers` импортируют их для FastAPI. DTO не должны импортировать `fastapi.Request`/`Response`. Не создавать `handlers.py` с классом для каждой операции только ради архитектурной симметрии.

### 3.1. Направление зависимостей

```text
api/routers ──> application ──> domain
     │               │
     └── api/dependencies ──> infra (composition)
workers ──────> application + infra
```

| Слой | Разрешено | Запрещено |
|---|---|---|
| `domain` | dataclass, value objects, чистые функции, инварианты | FastAPI, SQLAlchemy, брокеры, Pydantic HTTP DTO |
| `application` | Pydantic DTO, функции/use cases, auth context, репозиторные порты, управление транзакцией | `Depends`, `Request`, прямой WebSocket send, знание URL |
| `infra` | SQLAlchemy, DDF adapters, legacy DIO Desk auth client, Redis, RabbitMQ, S3 | Решать доменные права лишь на основании наличия токена |
| `api/routers` | Принять DTO, подключить Depends, вызвать функцию, вернуть DTO | ORM-запросы и бизнес-правила внутри endpoint |
| `api/dependencies` | Собрать из session/settings/repositories и auth-клиентов зависимости | Превращаться в единственный гигантский DI-контейнер |
| `api/routers/websocket` | Handshake, DDF serve/subscribe, lifecycle | Своя вторая бизнес-реализация Messenger |

**Практичный компромисс:** для PostgreSQL use case может принимать `AsyncSession` и управлять `async with session.begin()`. Это сознательная зависимость application от session/transaction API, **не** разрешение импортировать ORM-модели и писать SQL-логику во всех application-функциях. Для потенциальной Cassandra граница *хранилища истории сообщений* должна оставаться явной через репозиторий; не стремиться сделать абстрактную заменяемость всей PostgreSQL.

### 3.2. Функции по умолчанию; сервисы по необходимости

**Предпочтительно для одного сценария:** `send_message(...)`, `edit_message(...)`, `get_history(...)`, `resolve_sync_delta(...)` в `application/<module>/commands.py` или `queries.py`.

**Класс подходит**, если методы образуют устойчивое целое, используют общую зависимость/конфигурацию/состояние: `DioDeskAuthClient`, `AttachmentService`, `SyncService` (когда реально появились несколько связанных методов), `OutboxProcessor`. Не делать классы с единственным `.execute()` и тривиальным `__init__` на каждую операцию.

**Плохо:**

```python
class SendMessageHandler:
    def __init__(self, factory: UnitOfWorkFactory) -> None:
        self._factory = factory

    async def execute(self, command: SendMessageDTO) -> MessageDTO:
        ...
```

**Лучше:**

```python
async def send_message(
    command: SendMessageDTO,
    *,
    actor: AuthUser,
    uow: UnitOfWork,
    messages: MessageRepository,
    outbox: OutboxStore,
) -> MessageDTO:
    ...
```

Это сигнатура-пример: `send_message` получает уже готовые зависимости, а FastAPI разрешает их на уровне router/dependency. Конкретная транзакционная реализация приведена ниже.

## 4. Naming conventions

### 4.1. Python, database, API и WebSocket

| Объект | Правило | Правильно | Не следует |
|---|---|---|---|
| Python module/package | `snake_case`, смысловые названия | `conversation_policies.py` | `utils2.py` |
| Функция | глагол + предмет | `send_message`, `get_sync_delta` | `handle`, `process_data` |
| Класс | `PascalCase` для сущностей/реальных сервисов | `Message`, `DioDeskAuthClient` | `SendMessageHandler` без причин |
| DTO | `PascalCase`, окончание `DTO` при необходимости | `SendMessageDTO`, `MessageDTO` | `MessageResponseSchema`, `MsgDTO2` |
| Dependency alias | `PascalCase` с понятным контекстом | `DBSession`, `OutboxDep`, `CurrentUser` | `GetDb`, `DIOmegaAuth` |
| SQL | `snake_case`, таблицы plural | `conversation_members`, `created_seq` | `tblMessages` |
| Python ID | `_id: UUID`, единый термин | `conversation_id` | смесь `uid`, `chatId`, `conv` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_MESSAGE_LENGTH` | `MaxMsgLen` |
| JSON API | `camelCase` через `alias_generator=to_camel` | `clientMessageId`, `createdSeq` | разные стили в одном wire DTO |
| TS | `camelCase` values, `PascalCase` types | `useConversation`, `MessageList` | `use_chat` |
| WS event type | `noun.past_tense` | `message.created`, `member.removed` | `newMessage`, `MESSAGE_NEW` |
| Business event class | прошедшее время | `MessageCreated`, `MemberRemoved` | `CreateMessageEvent` |
| DB constraints | `ix_/uq_/fk_` + смысл | `uq_messages_sender_client_message` | `idx1` |

- В Python атрибуты DTO остаются в `snake_case`; **в HTTP JSON и payload новых Messenger WS-событий — `camelCase`**.
- Совместимость с DDF: базовый *envelope* `Event` может содержать `occurred_at`, `reply_to` и иные поля в собственном установленном формате. **Не ломать DDF serialization ради camelCase**; явно документировать границу `DDF envelope` (существующий формат) и `Messenger payload` (camelCase). То же касается низкоуровневых `Subscribe`/`Reply` DDF.
- Использовать английские имена сущностей в коде; комментарии и docstrings могут быть на русском, как в KB.
- Не переименовывать `Conversation` в `Chat` ради краткости; `Room` означает только транспортную комнату.

### 4.2. Словарь терминов: не создавать синонимы

- `conversation` — отдельная беседа; **не** `chat`/`dialog`/`room` как синоним внутри domain.
- `room` — только транспортная группа DDF Realtime.
- `thread` — ветка ответов (после MVP), `topic` — отдельная тематическая секция (после MVP); это разные понятия.
- `member` / `membership` — участие в беседе; `participant` — допустимо лишь в контексте отображения/звонков, если семантика отличается.
- `message` — доменная запись; `event` — изменение состояния; `delivery` — попытка/факт доставки.
- `created_seq` — позиция сообщения в истории; `event_seq`/`ConversationEvent.seq` — последовательность всех durable-изменений.
- `client_message_id` — ключ идемпотентности send operation; **не** заменяет серверный `message_id`.
- `principal` — идентичность на границе авторизации (`user`, `client`), не то же самое, что роль в conversation.
- `organization_id` — tenant ownership; не параметр для самостоятельного выбора из непроверенного user request.

### 4.3. Исключения и логирование

- Domain exceptions: `ConversationArchived`, `MessageEditNotAllowed`, `MemberNotFound`.
- Stable API error code: `conversation_not_found`, `permission_denied`, `idempotency_conflict`, `snapshot_required`.
- Logs: `logger.info("message committed", extra={"conversation_id": ..., "message_id": ...})`; **не** логировать `text`, attachment contents, authorization headers, websocket tickets.
- Не использовать `except Exception: pass`, `print`, бессистемное `logger.exception` с полными request payload.

---

## 5. API surfaces: `routers/user|service|admin|websocket|system`

Разделять router-пакеты по роли/назначению вызова, **не** копировать весь CRUD в каждую поверхность. Гостевые участники работают в `user` API с ограничениями на уровне ресурса.

| Surface | Аутентификация MVP | Доступ |
|---|---|---|
| `user` | **Access token текущего DIO Desk (Legacy IAM)**, `CurrentUser` | Текущий membership, effective policy, tenant ACL |
| `service` | Доверенная **Legacy DIO Desk** интеграционная аутентификация (`CurrentClient`/ограниченный admin fallback) | Отдельная allowlist операций и integration identity; не «admin = доступ ко всем чатам» |
| `admin` | `CurrentAdmin` / текущие роли DIO Desk | Только управление разрешёнными организационными ресурсами; аудит |
| `websocket` | Тот же Legacy DIO Desk auth context, полученный при handshake | По каждой подписке повторная авторизация; отзыв доступа |
| `system` | Ограниченная техническая поверхность | Health, readiness, metrics |

### 5.1. Источник аутентификации MVP — DIO Desk

**Не использовать новую IAM-систему в MVP Messenger.** Опираться на текущий путь входа DIO Desk и повторить разделение из `kb.back`: `AuthType` (`USER`, `CLIENT`, `ADMIN`), `Auth`, `AuthUser` в `application/auth/dtos.py`; `UnauthorizedError`/`PermissionDeniedError` от `ApplicationError`; зависимости `CurrentAuth`, `CurrentUser`, `CurrentAdmin`, `CurrentClient` в `api/dependencies/auth.py`.

`kb.back` использует `SrvIamClient` для legacy-аутентификации. Messenger может назвать свой adapter `SrvIamClient` по фактическому контракту

**Оговорка про multi-tenancy:** `_STUB_ORGANIZATION_ID` в KB — миграционная заглушка, а не доверенный tenant claim. Если Legacy IAM пока не возвращает организацию, Messenger может быть запущен **только в явно ограниченном single-tenant контуре**, с серверным маппингом на tenant и отдельным запретом произвольных cross-tenant операций. Нельзя считать `0000...0000` подтверждением tenant-принадлежности или безопасно включать гостевой multi-tenancy без доработки auth/ownership.

**Кеш:** в KB есть `InMemoryCache` на 10 минут — это пример стиля, **не рекомендуемая security policy Messenger**. TTL и механизм invalidation должны учитывать отзыв доступа; проверки актуального membership в Messenger независимы от auth cache. Долгоживущий кеш роли/токена без revocation может дать доступ после отзыва.

**Минимальный пример FastAPI-зависимости в стиле KB:**

```python
# src/api/dependencies/auth.py (фрагмент)
from typing import Annotated

from fastapi import Depends

from src.application.auth.dtos import Auth, AuthType, AuthUser
from src.application.auth.exceptions import PermissionDeniedError

CurrentAuth = Annotated[Auth, Depends(get_current_auth)]


def get_current_user(auth: CurrentAuth) -> AuthUser:
    if auth.type is not AuthType.USER or auth.user is None:
        raise PermissionDeniedError("User authentication required.")
    return AuthUser.model_validate(auth, from_attributes=True)


CurrentUser = Annotated[AuthUser, Depends(get_current_user)]
```

`get_current_auth` в примере — **функция из этого же модуля**, которая проверяет bearer token через Legacy DIO Desk adapter и типизированный auth cache. У неё нет прямых SQL-запросов к базе Messenger. **Не копировать целиком** KB login-реализацию без проверки конфигурации, lifetime, TTL, revocation и support для WS. Для `service` и `admin` используется собственная явная dependency и authorization сверх `AuthType`.

### 5.2. URL strategy

```text
# User: ресурсные пути, без обязательного /user/ в URL
POST   /v1/conversations
GET    /v1/conversations
POST   /v1/conversations/{conversation_id}/messages
GET    /v1/conversations/{conversation_id}/messages?beforeSeq=&limit=
GET    /v1/conversations/{conversation_id}/events?afterSeq=&limit=
GET    /v1/sync/manifest
GET    /v1/search/messages?q=

# Service: отдельная авторизационная граница
POST   /v1/service/context-conversations

# Admin
PATCH  /v1/admin/conversations/{conversation_id}/policy

# WebSocket
WS     /v1/ws

# Ops
GET    /health/live
GET    /health/ready
```

Параметры URL path сохраняют `snake_case`, если уже приняты в архитектуре. Query-поля, которые выводятся из DTO с `alias_generator=to_camel`, будут `beforeSeq`, `afterSeq`. Для существующих endpoint-контрактов можно явно зафиксировать иные query aliases, но нельзя незаметно смешивать соглашения.

### 5.3. `user` API

- Не принимать `sender_id`, `roles` и свободный `organization_id` из body: актор задаётся авторизацией.
- Проверять права отдельно на `send/read/edit/delete/forward/invite/search/download`; знание UUID не означает доступ.
- `POST /messages` требует `clientMessageId`; ответ `201` означает **committed PostgreSQL message + conversation sync event + outbox**.
- Повтор с тем же idempotency key возвращает прежний результат; конфликт с другим содержимым — стабильный `idempotency_conflict`.
- Для гостей применяются отдельные правила видимости истории, файлов и контекстных ITSM карточек.

### 5.4. `service` API — с учётом Legacy IAM

На текущем этапе в `kb.back` сервисы могут использовать `CLIENT/ADMIN` или временный admin fallback. Для Messenger этот fallback — **переходная совместимость**, а не право на все сервисные методы:

1. `get_current_client` аутентифицирует вызывающего через DIO Desk.
2. Application проверяет **конкретную интеграционную identity**, разрешённую операцию и пределы tenant/resource.
3. Для временного admin fallback требуется серверная allowlist доверенных интеграций (или эквивалентный ограниченный доверенный канал), аудит и план удаления fallback.
4. Provisioning incident-room выполняется с idempotency по `(tenant, provider, resource_type, resource_id)`.
5. Сервису **не разрешается** читать любую пользовательскую переписку лишь из-за `AuthType.ADMIN`.

Когда появится новый IAM с `client_credentials`, заменится auth-adapter, а не application-логика Messenger. Не реализовывать будущий OAuth flow внутри MVP.

```python
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ResourceReference(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    provider: str
    resource_type: str
    resource_id: str


class ProvisionContextConversationDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    organization_id: UUID
    context: ResourceReference
    title: str | None = None
```

`organizationId` допустим на `service` API **только** после доверенной привязки вызывающей интеграции к организации. `CurrentClient` не заменяет эту проверку.

### 5.5. `admin`, `system`, `websocket`

- `CurrentAdmin` подтверждает роль в Legacy DIO Desk; permissions на организацию и ресурс обязательны дополнительно. Администратор не получает право читать личные чаты автоматически.
- `/health/live` — дешёвая проверка процесса; `/health/ready` — зависимости конкретной роли процесса. `/metrics` не публиковать наружу, не использовать high-cardinality user IDs как labels.
- WebSocket — **соседний router-level адаптер**, не вложенный CRUD-контроллер и не отдельный набор бизнес-use cases. Общий auth context с HTTP, свои handshake, subscriptions, события и rate limits.

## 6. HTTP API implementation: DTO, dependency, errors

### 6.1. DTO в `application` и `camelCase` через Pydantic

Файл: `src/application/messaging/dtos.py`. `api/schemas/` не создаётся.

```python
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, PositiveInt
from pydantic.alias_generators import to_camel


class SendMessageDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    client_message_id: UUID
    text: str = Field(min_length=1, max_length=10_000)
    reply_to_id: UUID | None = None


class MessageDTO(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, frozen=True)

    id: UUID
    conversation_id: UUID
    client_message_id: UUID
    created_seq: PositiveInt
    event_seq: PositiveInt
    text: str
```

Wire JSON использует `clientMessageId`, `replyToId`, `createdSeq`, `eventSeq`. Pydantic примитивы применяются там, где они ясно выражают контракт: `PositiveInt`, `NonNegativeInt`, `EmailStr`, `AwareDatetime`, `UUID`; `Field` остаётся для конкретных длин/диапазонов. `populate_by_name=True` позволяет собирать DTO в Python через `client_message_id=...` и при этом использовать `clientMessageId` во внешнем JSON (для новой версии Pydantic можно использовать эквивалентные `validate_by_name/validate_by_alias`). В публичном SDK использовать только camelCase, не смешивать варианты.

**Не писать `field_validator` для одноразовой нормализации текста.** `min_length=1` не запрещает `"   "`; проверка содержимого — отдельная чистая функция, вызываемая при создании/редактировании (если валидация качается одного поля лучше обойтись средствами pydantic):

```python
def normalize_message_text(text: str) -> str:
    normalized = text.strip()
    if not normalized:
        raise EmptyMessageError("Message content cannot be empty.")
    return normalized
```

Где это обоснованно (например, сериализуемый DTO всегда должен содержать корректный формат), валидаторы Pydantic возможны, но не default для бизнес-процессов.

### 6.2. Dependencies отдельными файлами: `auth.py`, `db.py`, `messaging.py`

Базовая композиция в стиле `kb.back/src/api/dependencies/db.py`:

```python
# src/api/dependencies/db.py
from collections.abc import AsyncIterator
from typing import Annotated

from ddf.application.outbox import OutboxStore
from ddf.infra.database.sqlalchemy import PostgresConfig
from ddf.infra.outbox.sqlalchemy import SqlAlchemyOutboxStore
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.infra.database.connection import create_database
from src.infra.outbox import OUTBOX_CHANNEL

pg_config = PostgresConfig()
engine, sessionmaker = create_database(pg_config)


async def get_db() -> AsyncIterator[AsyncSession]:
    async with sessionmaker() as session:
        yield session


DBSession = Annotated[AsyncSession, Depends(get_db)]


def get_outbox(session: DBSession) -> OutboxStore:
    return SqlAlchemyOutboxStore(session, notify_channel=OUTBOX_CHANNEL)


OutboxDep = Annotated[OutboxStore, Depends(get_outbox)]
```

`DBSession` — **готовая request-scoped сессия**, а не `UnitOfWorkFactory`. Изменение состояния и `OutboxDep` должны использовать **одну и ту же** session. `AsyncSession` нельзя держать на весь срок WS connection.

```python
# src/api/dependencies/messaging.py
from typing import Annotated

from fastapi import Depends

from src.api.dependencies.db import DBSession
from src.application.messaging.repositories import MessageRepository
from src.infra.database.repositories.messages import SqlMessageRepository


def get_message_repository(session: DBSession) -> MessageRepository:
    return SqlMessageRepository(session)


MessageRepositoryDep = Annotated[MessageRepository, Depends(get_message_repository)]
```

Тонкий router вызывает *функцию*, а не обязательный `SendMessageHandler.execute`:

```python
# src/api/routers/user/messages.py
from http import HTTPStatus
from uuid import UUID

from fastapi import APIRouter

from src.api.dependencies.auth import CurrentUser
from src.api.dependencies.db import DBSession, OutboxDep
from src.api.dependencies.messaging import MessageRepositoryDep
from src.application.messaging.commands import send_message
from src.application.messaging.dtos import MessageDTO, SendMessageDTO

router = APIRouter(prefix="/v1/conversations", tags=["messages"])


@router.post(
    "/{conversation_id}/messages",
    response_model=MessageDTO,
    status_code=HTTPStatus.CREATED,
)
async def create_message(
    conversation_id: UUID,
    dto: SendMessageDTO,
    auth: CurrentUser,
    session: DBSession,
    messages: MessageRepositoryDep,
    outbox: OutboxDep,
) -> MessageDTO:
    return await send_message(
        dto,
        conversation_id=conversation_id,
        actor=auth,
        session=session,
        messages=messages,
        outbox=outbox,
    )
```

Логика функции (`application/messaging/commands.py`) называет проверки и transaction boundary явно:

```python
async def send_message(
    command: SendMessageDTO,
    *,
    conversation_id: UUID,
    actor: AuthUser,
    uow: UnitOfWork,
    message_repository: MessageRepository,
    outbox: OutboxStore,
) -> MessageDTO:
    text = normalize_message_text(command.text)

    await require_send_permission(
        actor=actor,
        conversation_id=conversation_id,
        message_repository=message_repository,
    )
    # append() резервирует seq, учитывает idempotency,
    # сохраняет Message + ConversationEvent в той же session.
    result, event = await message_repository.append(
        command,
        conversation_id=conversation_id,
        sender_id=actor.user.id,
        text=text,
    )
    await outbox.save_all([to_outbox_message(event)])
    # SqlAlchemyOutboxStore(..., notify_channel=...) пробуждает relay.
    # Если в реальном DDF notify выполняется иначе — адаптировать,
    # но не дублировать pg_notify на каждое сообщение.

    await uow.commit()
    return result
```

Пример **иллюстративен**: `messages.append`, `to_outbox_message`, `require_send_permission`, `save_all` нужно согласовать с точными DDF/репозиторными сигнатурами. `append` не должен прятать всё приложение и ACL в «магическом репозитории»: это узкая атомарная persistence-операция. **Idempotency обязана опираться на DB unique constraint**, а не только на предварительную проверку; после уникального конфликта исправная сессия/новая транзакция должна вернуть существующий результат или `idempotency_conflict`. Для callback/publisher нельзя делать отдельный неатомарный publish до commit.

### 6.2.1. Exception style как в KB

```python
# src/application/messaging/exceptions.py
from http import HTTPStatus

from ddf.application.exceptions import ApplicationError


class MessageNotFoundError(ApplicationError):
    status_code = HTTPStatus.NOT_FOUND
    error_code = "message_not_found"


class MessageEditWindowExpiredError(ApplicationError):
    status_code = HTTPStatus.CONFLICT
    error_code = "message_edit_window_expired"
```

Не превращать каждое доменное исключение в HTTP-исключение. Удобный KB-style `ApplicationError` применим на application boundary; *чистые доменные* исключения не должны импортировать HTTP-коды.

**Правило:** функции application не получают `Depends` и не импортируют `Request`/`Response`; API разрешает зависимости и возвращает Pydantic DTO; ошибки маппятся централизованно через DDF/exception handlers.

### 6.3. HTTP error contract

Использовать единый machine-readable error payload (например, `application/problem+json`, RFC 9457):

```json
{
  "type": "https://errors.dios.example/messenger/idempotency-conflict",
  "title": "Idempotency conflict",
  "status": 409,
  "code": "idempotency_conflict",
  "detail": "client_message_id was already used with different content",
  "request_id": "req-123"
}
```

URL в примере — **иллюстративный**, не адрес действующего сервиса. `detail` не должен раскрывать чужие message ID/данные, SQL-текст, email участников, внутренние названия ролей.

| Условие | HTTP | Stable code |
|---|---:|---|
| Нет корректной аутентификации | 401 | `authentication_required` |
| Запрещённая операция | 403 | `permission_denied` |
| Ресурс отсутствует или должен быть скрыт | 404 | `conversation_not_found` |
| Конфликт idempotency / revision | 409 | `idempotency_conflict` / `revision_conflict` |
| Не соблюдены бизнес-ограничения | 422 или 409 по контракту | `message_edit_window_expired` |
| Sync history недоступна по retention | 409 (или согласованный иной контракт) | `snapshot_required` |
| Временная перегрузка / rate limit | 429/503 | `rate_limited` / `temporarily_unavailable` |

Статусы и error codes должны быть закреплены contract tests. Домен не должен знать ни о `HTTPException`, ни о `status_code`.

---

## 7. Application & domain rules

### 7.1. Use cases — функции по умолчанию

- **Один небольшой сценарий → функция** `send_message`, `edit_message`, `search_messages`, `get_history`.
- DTO являются контрактами приложения, а не отдельными `api/schemas`. Для доменных инвариантов и событий применяются dataclasses и чистые функции.
- Use case получает `AuthUser` отдельно от DTO: отправитель **не определяется** клиентским `senderId`.
- `DBSession`/`OutboxDep` создаются в FastAPI dependencies; application-функция получает `AsyncSession`/`OutboxStore` явными параметрами. Не нужен искусственный `UnitOfWorkFactory` на каждый endpoint.
- **Классовые сервисы допустимы**: когда есть 3–5 связанных методов, общая конфигурация, кеш/HTTP client или управляемый lifecycle. Например, клиент DIO Desk auth, интеграционный adapter, сложный orchestrator.
- Не требовать отдельный class `*Handler`/`execute` для простых операций. Функция прозрачнее, лучше переиспользуется в workers и тестируется без DI-контейнера.

**Модульные названия:** `commands.py`/`queries.py` подходят для небольшого набора функций. При росте можно перейти на именованные файлы `send_message.py`, `edit_message.py`, `get_history.py`; не создавать пустые packages «про запас».

**Транзакция:** uow - UnitOfWork в application use case; repository не делает `commit()` самостоятельно. Для сложных операций допускается выделенный application service с явным constructor DI, но не дублирующий общий UoW.

**Корректность idempotency:** `get_by_client_message_id()` до INSERT не предотвращает гонку. Нужны уникальное ограничение и корректная обработка повторов/конфликтов уже после проверки атомарной вставки.

### 7.2. Transaction boundary

**MUST в одной транзакции:**

```text
Authorization-sensitive state / revision checks
  + allocate per-conversation event_seq
  + INSERT/UPDATE message or membership state
  + INSERT conversation_event
  + INSERT transactional_outbox
  + pg_notify (signal only; if handled by DDF OutboxStore, do not duplicate)
  => COMMIT
  => ACK
```

- Нельзя возвращать «sent», пока commit не подтверждён.
- Нельзя публиковать в RabbitMQ из открытой DB transaction и считать это атомарностью: это два несвязанных commit domains.
- Нельзя делать `pg_notify` единственным способом доставки: `LISTEN/NOTIFY` — сигнал пробуждения, не очередь.
- Публикация Outbox выполняется processor после commit; RabbitMQ consumers могут увидеть дубли.
- Нельзя включать долгий HTTP вызов к ITSM/AI/S3 **внутрь** транзакции записи сообщения. Внешние проверки, необходимые для инвариантов, нужно спроектировать с учётом race/consistency и ограничений времени.
- `SELECT FOR UPDATE` для conversation sequence применяется коротко. Hot-conversation contention измеряется load tests.

### 7.3. Domain entities: не создавать гигантский Conversation

**Правильно:**

```text
Conversation            -> metadata, state, policies
ConversationMembership  -> participant identity/role/history visibility
Message                 -> content, author, revision, created_seq
ConversationEvent       -> durable change, conversation_id, seq
Attachment              -> independent lifecycle
```

**Запрещено:** `Conversation(messages: list[Message])` как полный агрегат истории, загружаемый при каждой отправке. Не мутировать другие aggregates «из удобства» без корректной транзакционной границы.

### 7.4. Repository contracts

- Интерфейсы отражают use cases, а не 40 методов универсального `Repository[T]`.
- `MessageRepository.get_history(conversation_id, before_seq, limit)` и `ConversationEventStore.get_after(conversation_id, seq, limit)` имеют явную семантику сортировки и пагинации.
- SQLAlchemy ORM models не выходят из `infra` в API и domain.
- Один `AsyncSession` не разделяется конкурентными задачами/WebSocket sessions; scope DB session — отдельная короткая операция/UoW.
- Внутри repositories — только persistence mechanics; permissions нельзя «случайно забыть» через другой repository method: защищённые запросы/use cases должны иметь единый явный auth pathway.

---

## 8. WebSocket — транспортная граница, а не второе приложение

### 8.1. Что HTTP, что WebSocket

| Действие | Transport | Почему |
|---|---|---|
| Отправить/изменить/удалить сообщение | HTTP | Idempotency, DB ACK, retries, error semantics |
| Создать беседу / пригласить участника | HTTP | Resource command, permissions, auditable result |
| Первоначальная история, поиск, пагинация | HTTP | Query/pagination/cache/ACL |
| Manifest / delta sync / snapshot reset | HTTP | Reconciliation после disconnect |
| `message.created/edited/deleted` | WS push | Мгновенное уведомление об уже committed изменении |
| Typing / presence | WS | Эфемерная информация |
| Subscribe / unsubscribe / ping | WS commands | Управление realtime connection |
| User/system integrations | Service HTTP / broker | Не WebSocket от имени service principal |

**Не использовать WebSocket для durable send в MVP.** Позже это допустимо лишь при явной поддержке тех же idempotency/commit ACK/error guarantees, но ради MVP не нужно плодить второй путь записи.

### 8.2. Как использовать существующий DDF Realtime

Переиспользовать:

- `Connection` + bounded send queue + backpressure;
- `ConnectionManager` и `Room`;
- `serve_websocket(...)` / transport handler;
- `Subscription` / `SubscriptionAuthorizer`;
- rate limits, concurrency admission, slow-consumer handling;
- `RealtimePublisher` и Redis/RabbitMQ delivery adapters по согласованной схеме.

**Messenger добавляет** только доменную семантику: user auth context, membership authorization, room naming, event payloads, revocation, reconnect reconciliation.

```python
# Иллюстрация композиции с DDF, сигнатуры адаптировать к текущему DDF API.
from fastapi import APIRouter, WebSocket

from ddf.application.realtime import Room

router = APIRouter()


@router.websocket("/v1/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    principal = await authenticate_ws_user(websocket)  # Legacy DIO Desk auth

    # All dependencies are built at startup and stored in app.state.
    manager = websocket.app.state.realtime_manager
    config = websocket.app.state.ws_config
    handler = create_ws_handler(
        principal=principal,
        membership_reader=websocket.app.state.membership_reader,
    )

    await serve_websocket(
        websocket,
        config=config,
        manager=manager,
        handler=handler,
        initial_rooms=(
            Room(f"user:{principal.organization_id}:{principal.user_id}"),
        ),
    )
```

`authenticate_ws_user`, `create_ws_handler(...)` и импорт `serve_websocket` здесь **проектные места интеграции**, а не подтверждённые интерфейсы конкретной версии DDF. **Не** сохранять ORM session в `handler` на весь срок WebSocket-подключения.

### 8.3. Authentication при WS handshake

В браузере стандартный `WebSocket` API не позволяет произвольно устанавливать `Authorization` header. Предпочитаемые варианты:

1. Authenticated secure `HttpOnly` cookie + строгая проверка `Origin`, SameSite/CSRF threat model, tenant context, expiry; **или**
2. Короткоживущий одноразовый WS ticket, полученный через авторизованный HTTPS endpoint и проверяемый при handshake.

**Запрещено:** долгоживущий access token в query string, логи с WS ticket, безусловное доверие `Origin`/`Sec-WebSocket-Protocol` как доказательству личности. Если ticket передаётся в URL или subprotocol, требуется исключить его из access logs и убедиться в корректном истечении/одноразовом использовании.

Для handshake используется тот же доверенный контекст Legacy DIO Desk, что и в `api/dependencies/auth.py` (через отдельный WS adapter; HTTP `Request` туда не передаётся). После handshake права на подписки проверяются **повторно на каждый subscribe** и могут быть отозваны при изменении membership. Успешная авторизация в момент подключения не означает бессрочный доступ ко всем чатам.

### 8.4. Room naming и ACL

```text
user:{organization_id}:{user_id}
conversation:{conversation_id}
```

- `user:*` назначается сервером из доверенного principal; клиент сам не выбирает чужой user room.
- `conversation:*` требует активного membership, текущего tenant scope, policy check и контроля history visibility.
- На `member.removed` / revoke необходимо прекращать дальнейшую доставку: отключать/отзывать подписку, учитывать race с уже поставленными в очередь payloads и не отправлять закрытый текст в общедоступные rooms.
- Можно отправлять в user room **только минимальное уведомление**, а подробный message payload — после актуальной проверки допуска, либо через авторизованный Sync API.

### 8.5. Примеры wire messages

**Client → WebSocket: subscribe (схематично под DDF Command/Subscribe):**

```json
{
  "id": "2f08e077-a248-4cbd-8c23-86cb525bf1ae",
  "type": "subscribe",
  "payload": {
    "topic": "conversation",
    "key": "c8d8d8a5-61a3-40f9-bf8e-3b38fba1dfb4"
  }
}
```

**Server → Client: durable event (совместить с DDF Event envelope):**

```json
{
  "id": "5591d971-42bd-4fa8-99b9-f5fe2cc5bd1a",
  "type": "message.created",
  "version": 1,
  "occurred_at": "2026-11-22T08:15:00Z",
  "payload": {
    "conversationId": "c8d8d8a5-61a3-40f9-bf8e-3b38fba1dfb4",
    "eventSeq": 105,
    "messageId": "4db7678f-3fbc-4902-a9f0-2b152bfca8e6",
    "createdSeq": 105
  }
}
```

В примере `eventSeq` расположен **в Messenger payload**, поскольку существующий DDF `Event` имеет базовые поля `id/type/payload/version/occurred_at/reply_to`, но не обязуется иметь `seq` на верхнем уровне. Это не требование модифицировать DDF transport schema. Фактический wire-пакет должен соответствовать реализованному сериализатору DDF.

**Почему compact payload:** сообщение можно загрузить авторизованным HTTP запросом; полные payload допускаются в realtime лишь при проверенном audience/ACL и явной схеме. Не транслировать всему `user` room конфиденциальные данные по принципу «UUID трудно угадать».

### 8.6. Subscription authorizer (псевдокод)

```python
async def authorize_subscription(
    *,
    auth: AuthUser,
    subscription: Subscription,
    membership_reader: MembershipReader,
) -> bool:
    if subscription.topic != "conversation":
        return False

    conversation_id = parse_conversation_id(subscription.key)
    return await membership_reader.can_subscribe(
        auth=auth,
        conversation_id=conversation_id,
    )
```

- `can_subscribe` проверяет tenant, актуальный membership и policy, а не просто наличие записи в кеше.
- Предпочтителен `default-deny`: неизвестная topic или невалидный key не создаёт подписку.
- WS commands rate-limited; ограничены число активных подписок, размер frames, размер исходящей очереди.
- Все callbacks авторизации должны быть bounded по времени; на timeout — отказ/close по установленной DDF политике.

### 8.7. RealtimePublisher — кто и где публикует

```python
# Illustration: called by reliable event relay / consumer AFTER DB commit.
from ddf.application.realtime import Event, RealtimePublisher, Room


async def deliver_message_created(
    publisher: RealtimePublisher,
    event: Event[MessageCreatedPayload],
    *,
    conversation_id: UUID,
) -> None:
    await publisher.publish(
        event,
        to=Room(f"conversation:{conversation_id}"),
    )
```

**Никогда** не вызывать этот код из доменной сущности, перед commit или как единственный механизм гарантии доставки. Нельзя считать, что `publisher.publish` = прочтение адресатом. DDF транспорт реализует fan-out, Messenger отвечает за разрешённые получатели и семантику события.

### 8.8. Reconnect и gap handling

```text
WS online: client sees event_seq=105, local cursor=103
  -> DO NOT advance cursor to 105
  -> buffer event 105
  -> GET /v1/conversations/{id}/events?after_seq=103
  -> apply 104, then 105 (dedup by id/seq)
  -> persist new contiguous cursor = 105
```

На reconnect клиент запрашивает manifest/недостающие события даже если WS успешно переподключился. События могут приходить out-of-order, повторно и пропадать (Redis Pub/Sub at-most-once). Когда retention истёк — сервер возвращает `snapshot_required`; клиент проводит безопасный resync без стирания локального unsent Outbox.

---

## 9. Outbox, workers и интеграции

**Решение:** `Message + ConversationEvent + Outbox` атомарно в PostgreSQL; `pg_notify` в той же транзакции; `LISTEN/NOTIFY` будит worker, polling остаётся fallback; RabbitMQ — надёжный путь событий; Redis — быстрый best-effort fan-out. Подробности — [ADR-0003](adr/ADR-0003-transactional-outbox-and-realtime.md).

### Правила реализации

- Использовать готовые DDF `SqlAlchemyOutboxStore`/`OutboxProcessor`, не писать параллельный «свой mini outbox» только для Messenger.
- `NOTIFY` отправляет **сигнал**, а не весь контент сообщения; listener должен уметь batch-drain backlog.
- Outbox publish с RabbitMQ publisher confirms и безопасной повторной обработкой; дубли ожидаемы.
- Не держать соединение к RabbitMQ на одну HTTP request/отправку сообщения.
- `SKIP LOCKED` позволяет разделить работу между workers, **но не гарантирует порядок** по одной conversation. Не опираться на строгий broker ordering без согласованной стратегии.
- Worker должен иметь bounded concurrency, retry policy, metrics, graceful shutdown и понятный dead-letter/recovery process.
- Не делать AI-summary, ITSM enrichment или attachment scanning синхронной частью `POST /messages`.
- Если RabbitMQ/Redis недоступны, committed messages остаются доступны через HTTP; Outbox backlog и reconciliation восстанавливают доставку.
- Будущий fast path (`post-commit Redis publish`) — **не MVP default**: вводить только при подтверждённом SLO bottleneck.

### Обмен с ITSM

- Messenger сохраняет `ResourceReference`, а не полный Incident/Task aggregate.
- Внешние проверки/preview/actions — через собственные адаптеры и application ports с ограниченными timeout/retry.
- Любое действие над инцидентом выполняется **с собственным DIO Desk authorization**, даже если ссылка была валидна при создании сообщения.
- Integration events именовать и версионировать отдельно от UI WebSocket событий; не выносить Pydantic HTTP DTO как event contract.

---

## 10. Frontend code standards и Offline-first

Рекомендуемая логическая структура:

```text
apps/messenger-web/src/
  app/                       # routing, provider composition
  features/
    conversations/
    messaging/
    search/
  components/                # shared presentational components
packages/
  messenger-sdk/             # HTTP + WS wire types/client
  messenger-core/            # pure sync/outbox behavior
  messenger-storage/         # Dexie adapter/schema/migrations
  messenger-sync/            # reconciliation, retry, gap handling
  messenger-react/           # hooks, providers
  messenger-ui/              # reusable UI, style primitives
```

**Не обязательно сразу создавать все packages**: использовать тот же логический split внутри приложения и извлекать пакеты по мере появления второго потребителя (DIO Desk embedded).

### Правила

- IndexedDB — durable client projection и persistent Outbox. TanStack Query не должен тайно содержать вторую независимую «истину» сообщений.
- `SyncEngine` — самостоятельный модуль, не хук внутри `ChatPage.tsx` и не reducer на 1000 строк.
- `optimistic UI`: сообщение появляется после локальной durable записи (либо UI явно показывает, что сохранение на устройстве ещё не удалось), а не после ответа сервера.
- Один стабильный `client_message_id` на send operation; retry **не** генерирует новый.
- Не удалять локальный unsent Outbox при logout/snapshot reset без согласованной политики экспорта/очистки и UI предупреждения.
- Многовкладочная координация для избежания лишних retry; гарантией от дублей всё равно остаётся backend idempotency.
- Обрабатывать web app resume, смену сети, stale auth, revoked membership и storage quota errors.
- `useLiveQuery` / subscriptions и virtualized list — UI rendering. Для длинных историй обязательно сохранять scroll anchor при prepend.
- Держать message rendering безопасным: не использовать небезопасный raw HTML; sanitize/escape, защита от XSS и опасных URL.
- Разделять `queued/sending/retrying/failed` (локальное) и `sent/delivered/read` (подтверждённое сервером или протоколом получателей).
- Не обещать `delivered`, если backend не реализовал явный receipt protocol; «получено WebSocket событие на шлюзе» не равнозначно «доставлено устройству».
- Локальные данные отделять по principal/organization/session; policy доступа и очистка при смене организации/пользователя — отдельные сценарии безопасности.

### Пример frontend API вызова

```ts
export type SendMessageInput = {
  conversationId: string;
  clientMessageId: string;
  text: string;
  replyToId?: string;
};

// Transport adapter: Messenger payload uses camelCase; DDF envelope remains as defined by DDF.
export async function postMessage(input: SendMessageInput): Promise<MessageDTO> {
  return http.post(`/v1/conversations/${input.conversationId}/messages`, {
    clientMessageId: input.clientMessageId,
    text: input.text,
    replyToId: input.replyToId ?? null,
  });
}
```

`http` — общий авторизованный SDK client с ошибками и отменой, не сырой глобальный `fetch` из React-компонента. Реализация Local Outbox вызывает этот adapter, но `postMessage` **не** должен сам мутировать Dexie и UI: разделять транспорт и sync-orchestration.

---

## 11. Security standards (code-level)

- Авторизация user/service/admin/WS не взаимозаменяема; нет fallback «все с валидным токеном могут».
- Tenant constraints включать в ORM queries там, где это уместно, плюс проверять actor/resource в application. `conversation_id` без organization context не достаточен.
- Search индекс/сниппеты/FTS выдавать только после ACL. Считать существование закрытого объекта чувствительной информацией.
- Даже если пользователь имел доступ до исключения из беседы, после revocation нельзя продолжать доставку через активную WS подписку.
- Для guest chats по умолчанию AI выключен; enabling требует явной policy и согласия (дизайн согласия — отдельная задача).
- Forward проверяет source + destination permissions и политику пересылки. UI запрет forward не равен DLP.
- Download вложения через проверяемый permission boundary, не публичный постоянный S3 URL; предварительный upload/scan workflow.
- Не обещать невозможный запрет скриншотов в браузере.
- Только TLS/WSS по сети, encryption at rest, secret manager, audit; самодельное шифрование поверх TLS не использовать.
- В публичной ошибке не раскрывать traceback, connection string, internal topology или приватную membership информацию.

---

## 12. Testing, CI и code review requirements

### Минимальная test pyramid по scope

| Категория | Что проверять | Где |
|---|---|---|
| Unit | Domain invariants, edit/delete windows, message content, pure sync gap algorithm | `tests/unit/` |
| Integration | UoW/transactions, constraints, idempotency races, ACL, outbox + NOTIFY fallback, multiple instances | `tests/integration/` |
| E2E | Реальные user/service API сценарии, multi-device, offline, reconnect, subscriptions и revocation | `tests/e2e/` |
| Load | Hot conversations, send ACK p95, fan-out, reconnect storms, backpressure | `tests/load/` |

Security cases живут **в соответствующих категориях**, помечаются `security`/понятными test names, не обязательно в отдельном дереве. Полная матрица — [TEST_PLAN.md](TEST_PLAN.md).

### Требования к тестам

- Проверять не только happy-path, но и rollback, timeout, duplicate, reorder, auth revocation, stale cursor.
- Тест «один раз отправилось» **недостаточен**: обязательно concurrent duplicate send на уникальный constraint.
- Тесты не должны зависеть от порядка запуска, реального внешнего IAM/ITSM в unit, сна с фиксированным `asyncio.sleep()` вместо проверяемого condition.
- Integration для PostgreSQL/Redis/RabbitMQ — на реальных сервисах в тестовой инфраструктуре; unit — с узкими fakes/mocks на boundaries.
- Contract tests проверяют пользовательские/сервисные HTTP response, статус/ошибки и WS envelope version.
- Нагрузочные тесты отдельно от обычного PR blocking CI; минимальная smoke нагрузка может выполняться по schedule/перед релизом.
- Проверять авторизацию **в каждом API surface**: user, guest, service client, admin, WS subscribe/revoke.

### CI baseline

```text
pull request:
  ruff check + ruff format --check
  mypy
  pytest unit
  pytest integration (Postgres / Redis / RabbitMQ as needed)
  API schema / contract checks
  frontend typecheck + lint + unit

release / scheduled:
  e2e with real browser
  multi-instance fault injection
  load and SLO validation
  security regression suite
```

`mypy` должен быть настроен на строгую проверку **согласованного baseline** и не скрывать массово ошибки `# type: ignore`. Добавление type ignore требует объяснения. Не подавлять linters целыми директориями ради удобства.

### PR review checklist

```text
[ ] Новый код находится в правильном слое (`infra`, `application`, `api/routers`, `api/dependencies`); нет infra imports в domain.
[ ] Naming отражает предметную область; нет новых бессмысленных Helper/Manager.
[ ] Legacy DIO Desk auth используется явно; tenant/guest/service access не выводятся из заглушки organization ID или роли admin без проверки ресурса.
[ ] Idempotency, concurrency, transaction boundary определены.
[ ] ACK выдаётся только после durable commit; нет ненадёжного dual-write.
[ ] HTTP DTO и Messenger WS payload используют camelCase; DDF envelope совместим с существующим сериализатором; контракты версионированы.
[ ] Новые durable события восстанавливаются через Sync API.
[ ] Есть unit/integration tests на failure path, а не только happy-path.
[ ] Нет утечки секретов/контента в логи, events, metrics и ошибки.
[ ] Нет непроверенной оптимизации, увеличивающей complexity без измерений.
[ ] Обновлены docs/ADR/OpenAPI при изменении контрактов и гарантий.
```

---

## 13. Сводка: DO / DON'T

| DO | DON'T |
|---|---|
| Разделять API по actor/auth contract: user, service, admin, system, WS | Создавать пять копий одного CRUD или безграничный «internal» API |
| Сохранять Message + Event + Outbox одной транзакцией | `db.commit()` и затем best-effort `rabbitmq.publish()` как гарантию |
| Подтверждать send только после DB commit | Отдавать `sent` после приема WS пакета или TCP publish |
| Держать backend authoritative, IndexedDB — локальной проекцией | Делать Redis Pub/Sub или WS единственным источником пропущенных сообщений |
| Для WS использовать DDF + subscriptions/authorizer | Писать второй ConnectionManager и новую реализацию backpressure |
| Разделять durable/ephemeral events | Сохранять typing events как бесконечный durable log |
| Использовать type-safe application DTO, scoped DBSession и узкие порты | Протаскивать ORM Model в API/domain и создавать handler-class на каждую функцию |
| Делать cursor reconciliation и дедуп | Слепо обновлять cursor до max(seq) при gap |
| Держать транзакцию короткой | Вызывать S3/ITSM/AI внутри DB transaction |
| Явно фиксировать trade-offs и нагрузочные метрики | Вводить Cassandra/Kafka/fast path без подтверждённой необходимости |
| Передавать auth context на WS и проверять подписки | Доверять угаданному `conversation_id` или handshake навсегда |
| Создавать содержательные тесты на races/faults | Полагаться только на моковые unit тесты |

---

## 14. Definition of Done для функциональности Messenger

Фича считается законченной, если одновременно выполнены условия:

1. Зафиксированы доменные инварианты, API surface, права доступа и требуемые failure semantics.
2. Принято конкретное решение о transaction boundary, idempotency, ordering и replay там, где применимо.
3. Реализованы application DTO, function/use case и infra adapter **без нарушения dependency rule**.
4. При долговременном изменении реализовано соответствующее sync event и корректное восстановление после пропуска WS.
5. Клиентская offline/multi-device семантика согласована с backend; pending/error/retry состояния не вводят пользователя в заблуждение.
6. Есть тесты на нормальный сценарий, нарушения ACL и критический отказ/конкурентную гонку.
7. Контракты/ADR/docs обновлены; метрики и диагностические события достаточны для эксплуатации.
8. Ruff, mypy, pytest, frontend typecheck/линтеры и обязательный CI проходят.

### Что зафиксировано, а что уточнить перед реализацией

**Уже принято:** стек, `infra/` и структура `api/routers`/`api/dependencies`, application DTO + `camelCase`, вход через Legacy DIO Desk, функции use cases по умолчанию, server commit ACK, транзакционный Outbox, event-driven wakeup + fallback, DDF WebSocket, Offline-first, tenant ACL, per-conversation event seq, guest model.

**Нужно отдельно специфицировать:** конкретный Legacy DIO Desk AuthUser/CurrentClient adapter, tenant fallback и процесс его отмены, wire schema DDF `Subscribe`/`Reply`/`Event`, API идемпотентного `POST`, статус/тело `snapshot_required`, семантику истории приглашённого участника, удаление/retention, capability policy и delivery receipts. Открытые вопросы не должны обрастать скрытыми assumptions в коде.

**Базовое правило:** если требование нельзя однозначно покрыть автоматическим тестом или им нельзя руководствоваться на code review, его нужно уточнить до того, как оно станет частью публичного контракта.
