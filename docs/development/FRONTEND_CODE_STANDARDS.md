# DIO Messenger — Frontend Code & Implementation Standards (MVP)

> **Статус:** нормативный engineering guide / code review checklist · 2026-11-23  
> **Название frontend-папки и workspace:** `messenger.web/`  
> **Приоритет документа:** правила frontend-кода в дополнение к [FRONTEND_ARCHITECTURE](FRONTEND_ARCHITECTURE.md) и общему [CODE_STANDARDS](CODE_STANDARDS.md). Если ниже определена более строгая frontend-норма, применяется она. API/DB/WS semantics сверяются с утверждёнными контрактами backend.

## 1. Цель, термины и уровень строгости

Код должен быть **понятным, типизированным, тестируемым, устойчивым к неполному сетевому соединению и безопасным по умолчанию**. MVP не оправдывает временный UI state, который теряет сообщения, или скрытые `useEffect`-гонки.

Обозначения:

- **MUST / обязательно** — несоблюдение блокирует PR.
- **SHOULD / рекомендуемый default** — отклонение с конкретной причиной в PR.
- **MAY / допустимо** — оптимизация по обоснованному сценарию.

**Базовые принципы:**

1. **Prefer explicit code**: сначала простые функции и типы; абстракция только для нескольких реальных consumers.
2. **Functions first, classes when justified**: pure transformations и application use cases — функции. Долгоживущий lifecycle и общие зависимости — сервис-класс (`MessengerSyncEngine`, `WebSocketTransport`, `MediaUploadManager`).
3. **Local projection is the UI read model**: сообщения и беседы показываются из Dexie, не из незаметно расходящихся React/Zustand/TanStack caches.
4. **Durable local commands**: сообщение и Outbox-задание сохраняются атомарно **до** начала сетевого запроса.
5. **Protocol boundaries explicit**: backend DTO → validated/normalized model → DB; event envelope → validated event → atomic reducer → cursor.
6. **Never infer permissions from UI**: скрытая кнопка не заменяет серверную проверку ACL; cached policy только улучшает UX.
7. **Review for failure paths**: timeout, 401, 403, duplicate, reorder, partial cache, reload, multi-tab — нормальная часть use case.
8. **Stable identities**: `localId` для React key; `clientMessageId` для idempotency; `serverId` для backend; `eventSeq` для sync.
9. **No unnecessary infrastructure**: не создавать generic `BaseService`, plugin architecture, magic dependency container, custom form engine без реальной задачи.
10. **Design-system consistency**: визуальный стиль DIOS через токены, accessibility, без рандомных UI библиотек и неустойчивых layout hacks.

## 2. Workspace и layout

```text
messenger.web/
├── apps/messenger/
│   ├── src/
│   │   ├── app/                  # composition root / router / providers
│   │   ├── pages/                # route-level composition
│   │   ├── widgets/              # conversation list, message timeline
│   │   ├── features/             # composer, messaging, attachments, search
│   │   └── main.tsx
│   ├── vite.config.ts
│   └── package.json
├── packages/
│   ├── messenger-core/
│   │   └── src/
│   │       ├── models/
│   │       ├── commands/
│   │       ├── storage/
│   │       ├── outbox/
│   │       ├── sync/
│   │       ├── transport/
│   │       └── media/
│   └── messenger-ui/
│       └── src/
│           ├── components/
│           ├── primitives/
│           ├── tokens/
│           └── styles/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── eslint.config.js
└── prettier.config.js
```

**Правила границ:**

- `apps/messenger` может импортировать публичные API `messenger-core`, `messenger-ui`.
- `messenger-core` **не импортирует React, приложение, components, UI hooks**; хранит protocol, sync, storage, commands. Внутри можно разделить pure и browser-specific адаптеры.
- `messenger-ui` **не импортирует IndexedDB, React Query client, HTTP client или Sync Engine**. Принимает props и callbacks. Типизированные view models можно определить в UI/public shared types, не импортируя всё domain core.
- `features/*` общаются через публичные `index.ts` exports; глубинные импорты вроде `features/a/internal/private.ts` между features запрещены.
- `app/` — **composition root**; собирает runtime зависимости, auth adapter, router, theme. Файлы root app не становятся свалкой бизнес-логики.
- Не переносить file только ради названия слоя. Функции, используемые в одном feature, остаются рядом с feature; выносить в shared, когда есть повторное использование и понятная семантика.

### 2.1. Feature example

```text
features/composer/
├── components/
│   └── MessageComposer.tsx
├── hooks/
│   └── useComposer.ts
├── model/
│   └── toSendMessageCommand.ts
└── index.ts
```

Не создавать `hooks`, `model`, `utils`, `types` каталоги пустыми в каждом feature. У большого feature допустимо разделение `components/hooks/model`; небольшому достаточно 2 файлов.

### 2.2. Нельзя

```text
src/
  utils.ts             # 900 строк unrelated helpers
  api.ts               # fetch для всех сервисов приложения
  store.ts             # все сообщения + модалки + токены + курсоры
  services/
    BaseService.ts
    MessengerService.ts  # «бог-объект» для всего
```

## 3. Naming conventions

| Объект | Правило | Пример |
|---|---|---|
| Компонент React | `PascalCase`, файл совпадает с компонентом | `MessageBubble.tsx` |
| Hook | `use` + `PascalCase` смысл / camelCase функция | `useConversationMessages.ts` |
| Pure function | `camelCase`, глагол + предмет | `reconcileMessage`, `formatMessageDate` |
| Boolean | `is`/`has`/`can`/`should` | `canForwardMessage`, `isOffline` |
| Тип, interface, union | `PascalCase` | `LocalMessage`, `ConversationEvent` |
| DTO/wire type | Суффикс `Request`/`Response` при необходимости | `SendMessageRequest` |
| Event payload | Событие-свершившийся факт | `MessageCreatedPayload` |
| Устойчивый ID | Тип или ясный суффикс | `clientMessageId`, `serverId` |
| Константа | `UPPER_SNAKE_CASE` | `MAX_RETRY_ATTEMPTS` |
| CSS Module | Имя компонента | `MessageBubble.module.css` |
| CSS token | `--dio-...` или согласованный namespace | `--dio-surface`, `--dio-text` |
| Test | `*.test.ts(x)` / `*.spec.ts` | `applyEvent.test.ts` |
| CSS class | Локальный camelCase | `styles.messageBubble` |
| Barrel | Только публичный API узкого модуля | `features/messaging/index.ts` |
| Workspace | Нижний регистр, чёткое назначение | `messenger.web` |

**Избегать:** `useData`, `handleSomething`, `doAction`, `state1`, `Item2`, `Utils`, `Helper`, `BaseRepository<T>`, `IMessage`, венгерской нотации и суффикса `Manager` без реального state/lifecycle.

**Семантика моделей:** `Message` — каноническая domain/API сущность; `LocalMessage` — запись клиента; `MessageViewModel` — данные, подготовленные к render; `SendMessageRequest` — wire DTO. Не называть все четыре просто `Message`.

## 4. TypeScript: обязательная строгость

Рекомендуемые compiler options (настройки могут потребовать дополнительных опций для сборки/монорепозитория):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "jsx": "react-jsx"
  }
}
```

Правила:

- **MUST:** типы на публичных функциях / портах / IO boundaries, внятные discriminated unions, обработка `undefined`, `unknown` для непроверенных network errors.
- **ЗАПРЕЩЕНО:** `any` для обхода типизации, `as unknown as T` ради заставить компилятор молчать, многочисленные `!` без доказанного инварианта, `// @ts-ignore` без точечной причины.
- **SHOULD:** `type` для unions/value models; `interface` для object contracts/ports, где важно расширение/подмена реализации. Не догматизировать различие.
- **SHOULD:** `readonly`, `ReadonlyArray<T>` для внешних immutable boundaries, если mutation не нужна.
- **SHOULD:** `satisfies` для проверяемых static configuration objects; избегать неявной строки вместо enum/literal union.
- **MUST:** backend-driven decimal strings и UUID сохраняют тип; `Number(...)` для непрозрачных cursor запрещён.
- `createdSeq`/`eventSeq`: если API отдаёт JS safe integers, валидировать numeric bounds. Для общего `BIGINT` использовать opaque cursor/string. Это часть API-контракта, не выбор конкретного React-компонента.

Пример честного закрытого union:

```ts
type DeliveryState = "queued" | "sending" | "sent" | "retrying" | "failed";

type MessageContentBlock =
  | { type: "text"; text: string }
  | { type: "media"; assetId: string }
  | { type: "resource"; provider: string; resourceType: string; resourceId: string };
```

### 4.1. Exhaustive switches

```ts
function assertNever(value: never): never {
  throw new Error(`Unexpected discriminant: ${String(value)}`);
}

function renderBlock(block: MessageContentBlock): React.ReactNode {
  switch (block.type) {
    case "text":
      return <TextBlock text={block.text} />;
    case "media":
      return <MediaBlock assetId={block.assetId} />;
    case "resource":
      return <ResourceBlock reference={block} />;
    default:
      return assertNever(block);
  }
}
```

Этот пример находится в `.tsx` в UI feature; в `messenger-core` не должны появляться `ReactNode` и JSX.

## 5. API / WS contracts и генерация типов

**Backend wire format:** `camelCase` через Pydantic `alias_generator`, DTO на backend в `application/<module>/dtos.py`, роутеры разделены по `user/service/admin/websocket`. Frontend не придумывает новые имена полей и не переименовывает `clientMessageId` в `client_message_id` в произвольном компоненте.

### 5.1. HTTP

- Генерировать типы/typed client из **OpenAPI backend** (например, `openapi-typescript` или `@hey-api/openapi-ts`); закрепить инструмент/настройки в `messenger.web` и CI.
- Сгенерированные файлы складывать в отдельную директорию `transport/generated/`; **не редактировать руками**.
- Generated DTO не делать локальной моделью IndexedDB один-в-один; необходим небольшой `toLocalMessage(dto)` boundary mapper.
- HTTP client имеет единые timeout/cancellation, auth injection, error mapping, `correlationId` и понятные result/error types.
- Один typed client поверх `fetch`; не писать `fetch('/v1/...')` в React components или глубоко внутри reducers.
- Security: не логировать `Authorization`, содержимое сообщений, cookies, presigned download URLs.

### 5.2. WebSocket и DDF

- **Нативный WebSocket**; использовать существующий transport DDF Realtime (envelope, subscribe, unsubscribe, ping/reply, room authorizer, backpressure). Не строить вторую схему комнат/протокола поверх него без причины.
- Browser WebSocket **не поддерживает пользовательский Authorization header**. Auth через безопасный cookie-based handshake или short-lived scoped ticket, полученный через HTTP, плюс backend `Origin` validation. Не передавать постоянный Bearer в URL.
- **Один WebSocket client на runtime/tab**, а не на каждый чат и не на каждый `MessageBubble`.
- Разделить `connection state`/`typing`/`presence` (ephemeral) и durable domain events. Durable доставку всегда дополняет Sync API.
- Все inbound network messages считаются `unknown`; validate discriminant, version, required fields, scope и authorized room перед apply. Генерация TS interfaces сама по себе не выполняет runtime validation.
- Можно использовать точечный **Zod/Valibot** parser на network boundary. Не писать вторую огромную runtime schema для всего OpenAPI без необходимости; протокол DDF envelope и payload events должен иметь ясное schema ownership.

Пример только payload внутри DDF envelope:

```ts
type DurableEvent =
  | { type: "message.created"; payload: MessageCreatedPayload }
  | { type: "message.edited"; payload: MessageEditedPayload }
  | { type: "message.deleted"; payload: MessageDeletedPayload }
  | { type: "reaction.added"; payload: ReactionAddedPayload };

function handleEnvelope(envelope: unknown, deps: EventDependencies): Promise<void> {
  const event = parseDdfEnvelope(envelope); // runtime validation
  return deps.sync.acceptEvent(event);      // buffering + ordered apply
}
```

`parseDdfEnvelope` и `EventDependencies` — **проектные интерфейсы**, а не имена существующего DDF SDK.

### 5.3. Idempotency и HTTP semantics

- `POST` Send обязательно передаёт **стабильный** `clientMessageId`, созданный и сохранённый до первого запроса.
- Server ACK означает database commit; не переводить локальный статус в `sent` по HTTP 202/broker enqueue без отдельного согласованного контракта.
- HTTP timeout означает **неизвестный результат**, а не доказанную неудачу; повторить с исходным idempotency key.
- `403`/policy denial — terminal user action; `401` — остановить sync и перепроверить Legacy DIO Desk session.
- Retry не должен запускаться каждым mount React-компонента.

## 6. Code patterns: функции по умолчанию

### 6.1. Команда application → IndexedDB

```ts
export async function queueMessage(
  command: CreateMessageCommand,
  deps: { db: MessengerDatabase; accountKey: string; wakeup: SyncWakeup },
): Promise<string> {
  const clientMessageId = crypto.randomUUID();

  await deps.db.transaction(
    "rw",
    deps.db.messages,
    deps.db.outbox,
    async () => {
      await deps.db.messages.add({
        localId: clientMessageId,
        accountKey: deps.accountKey,
        conversationId: command.conversationId,
        clientMessageId,
        content: command.content,
        deliveryState: "queued",
      });
      await deps.db.outbox.add({
        id: clientMessageId,
        accountKey: deps.accountKey,
        conversationId: command.conversationId,
        type: "message.send",
        command: { ...command, clientMessageId },
        state: "pending",
        attempts: 0,
        nextAttemptAt: 0,
      });
    },
  );

  deps.wakeup.requestFlush();
  return clientMessageId;
}
```

Функция не зависит от React/HTTP и не открывает сетевые соединения. Сначала локальный transaction commit, затем wakeup. Типы `CreateMessageCommand`, `SyncWakeup`, `MessengerDatabase` — из модулей `messenger-core`, не глобальный mutable context.

### 6.2. Pure reconciliation function

```ts
function mergeServerAck(
  local: LocalMessage,
  ack: SendMessageAck,
): LocalMessage {
  if (local.clientMessageId !== ack.clientMessageId) {
    throw new MessageIdentityMismatchError();
  }
  return {
    ...local,
    serverId: ack.messageId,
    createdSeq: ack.createdSeq,
    revision: ack.revision,
    deliveryState: "sent",
  };
}
```

Чистая функция возвращает новый объект, а Dexie transaction управляет записью и удалением Outbox item. **Нельзя** делать `setMessages([...])` в callback HTTP и отдельно записывать IndexedDB: это создаст две расходящиеся версии.

### 6.3. Когда класс оправдан

```ts
class MessengerSyncEngine implements SyncEngine {
  constructor(
    private readonly db: MessengerDatabase,
    private readonly http: MessengerHttpClient,
    private readonly ws: MessengerRealtimeClient,
  ) {}

  async start(): Promise<void> {
    // Load state, subscribe, catch up, flush.
  }

  async stop(): Promise<void> {
    // Abort network work and close owned resources.
  }
}
```

Это полноценный lifecycle с ресурсами, таймерами, retry/backoff и несколькими связанными методами — класс здесь оправдан. Не превращать операции `sendMessage`, `formatDate`, `toLocalMessage` в классы `*Handler.execute()` по шаблону.

## 7. Правила IndexedDB / Dexie

### 7.1. Transaction boundary

**MUST** атомарно сохранять:

- Создание `LocalMessage` + `OutboxItem`.
- Применение durable event + изменение sync cursor.
- Reconciliation HTTP ACK + удаление pending command.
- Инвалидирование локальных сообщений при revocation + отметка access state (для одного account scope).

**MUST NOT** вызывать HTTP/WS или ждать произвольных длительных async operations внутри Dexie transaction. Только IndexedDB operations и короткие pure computations.

**MUST** перечислять в Dexie transaction все stores, которые могут быть затронуты внутри вложенных функций. `applyEventProjection()` не вправе тайно писать в неуказанную таблицу.

### 7.2. IndexedDB indexes

- Индексы проектируются под запросы: recent messages, keyset pagination, pending Outbox by due time, messages by serverId/clientMessageId, drafts by conversation.
- Не сканировать всю таблицу сообщений, чтобы получить последние 50.
- Избегать сложных `filter()` на тысячах записей, когда можно использовать compound index.
- Не записывать огромные медиа-оригиналы в IndexedDB по умолчанию; хранить metadata и ограниченный thumbnails cache.
- Для `localId` — стабильный key до и после ACK; `clientMessageId` — отдельный уникальный индекс; `serverId` может быть `undefined` до ACK.
- DB migrations должны сохранять **неотправленный Outbox** или явно и безопасно блокировать upgrade, если восстановление невозможно.

### 7.3. Data ownership и cleanup

- `accountKey` формировать из реальной Legacy DIO Desk identity/verified organization. Не доверять route param или legacy stub UUID.
- При смене аккаунта — остановить Sync Engine, закрыть auth-bound resources, переключить изолированную local DB/scope; не смешивать данные.
- При logout/policy cleanup — удалять sensitive local state, media cache и закрывать открытые previews по согласованной политике; гарантировать backend revoke даже если local cleanup частично провалился.
- Не создавать скрытый `localStorage` cache токенов, messages или черновиков в обход этой политики.

## 8. React: требования к компонентам и эффектам

### 8.1. Component patterns

- **MUST:** компоненты — UI-only, получает props/state и handlers; side effects сосредоточены в адаптерах и top-level providers.
- **MUST:** стабильный `key` по `localId`, а не array index/`serverId`, который появляется позже.
- **MUST:** composable components вместо `MessageBubble` на 1000 строк с множеством `if` по типам контента.
- **SHOULD:** presentational components с читаемыми props (`message`, `isOwn`, `canEdit`, `onReply`) и преобразование в view models вне JSX.
- **SHOULD:** hooks для тонкой подписки на local query и bridge в command; не помещать туда retry loops и таймеры WSS.
- **SHOULD:** use `memo`/`useMemo` только там, где profiling показывает стоимость, а не повсеместно.

```tsx
function MessageTimeline({ conversationId }: { conversationId: string }) {
  const messages = useConversationTimeline(conversationId);
  return <VirtualizedTimeline items={messages} />;
}
```

`useConversationTimeline` выбирает страницы из Dexie и объединяет confirmed+optimistic view models. `VirtualizedTimeline` не знает HTTP/WS и может быть покрыт component tests.

### 8.2. `useEffect` — не orchestration engine

**Не делать:**

```tsx
useEffect(() => {
  const socket = new WebSocket(url);
  socket.onmessage = (event) => setMessages((old) => [...old, event.data]);
  return () => socket.close();
}, [conversationId]);
```

Такой подход создаёт WebSocket на каждый чат, пишет сырые payload в React state, не дедуплицирует events, не восстанавливает пропущенные и теряет историю при reload.

**Делать:** top-level runtime владеет WS/Sync Engine, компоненты получают `useLiveQuery` из IndexedDB. `useEffect` допустим для UI subscriptions и управляемого `start/stop` runtime на границе приложения с корректным cleanup.

### 8.3. Accessibility и UX

- Доступная клавиатурная навигация по сообщениям, меню и composer.
- `aria`-статусы ошибок/отправки; не спамить screen reader каждым typing event.
- Поддержка IME, paste, Shift+Enter, drag/drop.
- Respect `prefers-reduced-motion`, контраст и focus-visible.
- Scroll anchoring при historical pagination; запрет автоматического scroll-to-bottom, если пользователь читает старое.
- Skeleton только когда **нет** локальных данных, не при каждом refetch.
- Media placeholders резервируют width/height; не допускать layout shift после thumbnail load.

## 9. TanStack Query и Zustand: чёткие ограничения

### TanStack Query

**Для чего использовать:** поиск, preview внешнего ITSM resource, server-side lookup пользователей, action metadata, data queries, у которых не нужна локальная долговременная проекция.

**Не использовать как второй authoritative message cache.** Если HTTP возвращает историю, нормализовать/применить её в IndexedDB в Sync Engine; React читает Dexie. Не полагаться исключительно на persisted mutations TanStack для отправки сообщений: у custom Outbox лучше контроль схемы, транзакций и reconciliation.

### Zustand

**Допустимые store:** активная панель, layout, selection, chat sidebar visibility, незакреплённые ephemeral UI values.

**Запрещённое содержимое глобального Zustand:** вся история `messages[]`, серверные sync cursors, HTTP retry queue, bearer tokens, копия Dexie conversations. Большие mutable массивы особенно вредят rendering и усложняют тесты.

В маленьком компоненте локальный `useState` проще, чем новый Zustand slice.

## 10. CSS, UI Kit и дизайн

- Дизайн-токены DIOS через CSS variables: canvas/surface/text/action/spacing/radius/typography/motion. Не делать hardcode цветов, размеров и теней в каждом компоненте.
- **CSS Modules** локализуют классы; общие reset и тема централизованы.
- Radix/другие accessibility primitives используются выборочно; визуальный стиль остаётся собственным.
- Не смешивать несколько UI-kit frameworks ради мелких компонентов; при появлении второго — ADR/обоснование.
- Для messenger layouts — предсказуемые `grid/flex`, правильный `min-height: 0`, scroll containers, sticky composer, responsive sidebar.
- Динамические сообщения — layout-aware: attachments / image aspect ratio до полной загрузки.
- Тёмная/светлая тема без gradients by default, нейтральные поверхности и осмысленные акценты; предпочтения наследовать от DIO Desk или локальных settings согласно product policy.
- Иконки — консистентная собственная DIOS-библиотека/один стандартизированный набор до их появления; не подменять уникальные знаки бренда случайными emoji.

## 11. Media + attachments + avatars: требования к коду

- `MediaAsset` не превращать в `Message` с десятками nullable-полей; использовать typed content blocks и отдельную media metadata projection.
- `MediaUploadManager` допустим как класс, если владеет concurrent transfers/abort controllers/upload sessions; простые mappers и guards — функции.
- File selection → local preview → create upload session → S3 upload → finalize → worker READY → send message with `assetId`.
- Не передавать S3 credentials на клиент. Использовать **короткоживущие** presigned upload/download URLs, выдаваемые backend после ACL.
- Не хранить presigned URL в IndexedDB как постоянное поле `MediaAsset`; не включать его в telemetry/logs.
- Не читать пользовательский MIME/width/height как истину; проверенные metadata приходят с backend.
- Для thumbnail cache — policy limits по объёму/времени/tenant; original file caching только по явному требованию.
- Generated group avatar — стабильный lettermark по conversation seed; member collage — UI composition; custom avatar — ссылку на MediaAsset. Пользовательские аватары — через DIO Desk auth/profile.

## 12. Security и Identity

- **Legacy DIO Desk**, не новая IAM: `MessengerAuthAdapter` инкапсулирует identity, login/refresh/logout, токен для HTTP. Не копировать hardcoded `_STUB_ORGANIZATION_ID` в локальные ключи.
- Нельзя допускать произвольный account scope из URL/query. Сервер всегда проверяет membership и policy.
- По умолчанию — access token в памяти через host-managed auth, либо согласованная cookie/BFF схема; *не* persist в `localStorage`, `sessionStorage`, IndexedDB.
- Browser WebSocket аутентифицируется согласованным cookie/ticket flow, плюс Origin validation и per-room subscription authorization.
- Изоляция внутреннего/гостевого чата видна в UI, но server ACL важнее любого баннера.
- Не рендерить чужой HTML/Markdown напрямую в `innerHTML`; безопасный renderer для AST, валидированные URL и media previews.
- Не писать message text/audio, секреты и signed URLs в console, error telemetry и analytics.
- Logout/role revoke приводит к stop синхронизации и policy-aware purge/lock локальной проекции; при offline revoke мгновенная очистка физически невозможна.
- Если organization policy запрещает offline access, нельзя случайно отдавать сообщения из IndexedDB до онлайн-проверки.

## 13. Multi-tab и reentrancy

- **Outbox MUST быть безопасен** при двух вкладках. Решение: Web Locks API (с feature detection) или lease/CAS на записи; server idempotency остаётся обязательной защитой.
- Даже при координации между вкладками `ws event` и `http ACK` могут прийти в любом порядке; запись должна дедуплицироваться по `clientMessageId`/`serverId`.
- `BroadcastChannel` — сигнал координации, не durable event stream.
- Reconnect / start / stop должны быть идемпотентны: нельзя создавать несколько таймеров или подписок после каждого retry.
- При смене identity отключать старые handlers; async responses с предыдущего account scope должны игнорироваться, даже если пришли после logout.

## 14. Error handling и retries

| Класс ошибки | Поведение |
|---|---|
| Network/timeout | Retry c тем же idempotency key, backoff + jitter |
| 5xx / unavailable | Ограниченный retry, показать queued/retrying |
| 429 | Учитывать `Retry-After`, не спамить API |
| 401 | Приостановить sync, re-auth через DIO Desk adapter |
| 403 / revoked membership | Не повторять бесконечно, запретить операцию, revalidate/purge |
| 409 / revision conflict | Показывать актуальное серверное состояние, выбор пользователя |
| Invalid content / attachment rejected | Terminal user action; сохранённый draft остаётся |
| Sync gap | Buffer → delta catch-up, cursor не перепрыгивает |
| `snapshot_required` | Rebuild projection, не терять pending Outbox |

Текст ошибки для пользователя отделять от технических details; серверные `errorCode` преобразовывать в понятный UI status. Не показывать traceback/SQL errors или секретные ID других пользователей. Log levels и breadcrumbs — без PII.

## 15. Performance rules

- Виртуализировать длинные timeline/списки. Не хранить/рендерить 10 000 MessageBubble одновременно.
- Запрос из Dexie должен быть индексным и ограниченным по page size. Фильтрация всей таблицы ради одного экрана запрещена.
- Следить за `useLiveQuery` dependencies: не пересоздавать запросы по любому render, избегать подписки на всю БД при смене одного сообщения.
- Не создавать по одному global event listener, WebSocket, ResizeObserver на каждое сообщение без cleanup и необходимости.
- Нагрузка на UI: frame budget, scroll FPS, long tasks, IndexedDB write latency, memory pressure. Сначала measure, затем `memo`/workers/batching.
- Для `media` — lazy loading, placeholders по dimensions, отмена загрузки невидимых больших ресурсов.
- Не оптимизировать ACK за счёт нарушения server commit semantics.

## 16. Тестирование и quality gates

### 16.1. Unit (Vitest)

- `mergeServerAck`, `applyEventProjection`, message ordering, status transitions, conflict rules, view-model transforms.
- Tests pure functions без React/Network.
- Schema parsing `unknown` WS и невалидных payloads.

### 16.2. Integration (Vitest + fake-indexeddb + MSW)

- Atomic local write Message+Outbox; невозможность частичной записи.
- Transactional event apply + cursor; rollback при `SyncGapError`.
- Restart после `processing` lease; retry с тем же `clientMessageId`.
- Lost HTTP response после server commit; WS echo раньше ACK.
- Dexie migrations сохраняют pending jobs.

### 16.3. Component (Testing Library; Storybook по необходимости)

- Composer keyboard/IME, pasting, upload progress, disabled policy actions.
- Message preview, reply, multi-content blocks, warning for guest chats.
- A11y: focus management, reduced motion, status announcements.

### 16.4. E2E (Playwright)

- Offline → Send → Reload → Reconnect → ровно одно сообщение.
- Multi-tab concurrent sends + consistent timeline.
- Gap detection and delta recovery / retention snapshot recovery.
- Scroll anchoring при prepending older messages.
- Membership revocation и очистка/restrict локального кеша.
- Прямая загрузка S3 (test S3-compatible storage), worker READY, прикрепление media.
- Обновление SW при pending Outbox: нет потери задач.

### 16.5. CI quality gates

На каждый PR:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test:unit
pnpm test:integration
pnpm build
```

Небольшой критичный Playwright smoke set — на PR или merge по скорости pipeline. Полный E2E + multi-browser, accessibility/performance regression — release/nightly (согласно фактической инфраструктуре). Не делать load tests обязательным блокером каждого небольшого PR без выделенного окружения и статистически устойчивой методики.

**Тесты безопасности** размещать в unit/integration/E2E в зависимости от границы проверки (без отдельной папки `security/` только ради лейбла); помечать `security` test tag/name.

## 17. Documentation, reviews, Definition of Done

Изменение протокола синхронизации, локальной schema или архитектуры пакетов требует актуализировать **[FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md)** и соответствующие backend contracts/ADR. Migrations требуют фиксации версии и теста на upgrade при непустом Outbox. Code examples — illustrative, не substitute контрактов.

### PR checklist

- [ ] Есть явная бизнес-задача, нет лишнего framework/abstract class.
- [ ] `messenger-core` не зависит от React/UI, UI не импортирует storage/HTTP.
- [ ] TypeScript strict соблюдён; нет безосновательных `any`, двойного `as`, `ts-ignore`.
- [ ] Backend wire models и event types соответствуют OpenAPI/DDF payload.
- [ ] Перезапуск, offline, timeout, duplicate, reordered events обработаны или неприменимы по тесту.
- [ ] Send пишет local message и Outbox атомарно.
- [ ] Server ACK/WS echo сходятся к **одному** локальному сообщению, cursor никогда не перепрыгивает gap.
- [ ] IndexedDB transaction не включает HTTP и перечисляет все используемые таблицы.
- [ ] Не нарушена scoped isolation по пользователю/организации, гостевые ACL не обходятся.
- [ ] Нет log/analytics утечек текста переписки, токенов, signed URLs.
- [ ] Scroll/virtualization/resize и accessibility проверены для UI изменений.
- [ ] Tests добавлены в правильной категории, migrations протестированы.
- [ ] Документация/ADR обновлены при изменении правил.

### Заведомо недопустимые shortcut-решения

| ❌ Не делать | ✅ Как делать |
|---|---|
| `fetch()` в `MessageBubble` | Typed API в `transport`, вызывать из application/runtime |
| `setMessages()` как источник истины | Обновлять Dexie, React подписывать через live query |
| React `useEffect` делает sync all the things | Sync Engine с `start/stop`, retry и cursor |
| WebSocket на каждый чат | Один управляемый transport + DDF subscriptions |
| `serverId` как key для optimistic bubble | Неизменный `localId` |
| Отправка до local Outbox commit | Сначала атомарная запись, затем network flush |
| HTTP timeout → создать новую команду | Retry исходного `clientMessageId` |
| WS received → присвоить max seq | Проверить gap и атомарно применить events |
| `message` с nullable медиа полями | Typed content blocks + MediaAsset |
| Сохранять presigned URL в history | Asset IDs, временный URL при доступе |
| `localStorage` для Bearer tokens/переписки | Host auth + scoped IndexedDB / безопасные policy |
| Публичный CDN для приватных вложений | ACL + signed access + private origin |
| Новая библиотека на каждый feature | Использовать выбранные primitives и contracts |
| «Offline-first обеспечивается Service Worker» | IndexedDB + Local Outbox + Sync Engine; SW — app shell |

## 18. Рекомендуемый порядок внедрения правил

1. **До первого PR:** `messenger.web/`, pnpm/Vite, TypeScript strict, ESLint/Prettier, namespace/token conventions.
2. **С первым messaging feature:** Dexie migrations, typed local models, API client, local atomic commands, Outbox tests.
3. **До realtime:** DDF WS adapter, type/validation, idempotent `applyEvent`, cursor tests, auth handshake.
4. **До пилота:** multi-tab, E2E offline/reload, security/revocation policy, accessibility/scroll tests, PWA app shell.
5. **После измерений:** leader tab, advanced caching, workers, offline media resume, CDN, дополнительные пакеты.

**Общий принцип:** строгие границы, прозрачные зависимости, минимум магии. Важна не максимальная архитектурная абстрактность, а корректная и понятная реализация продуманных инвариантов Messenger.
