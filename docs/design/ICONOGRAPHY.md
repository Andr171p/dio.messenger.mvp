# DIO Messenger — Iconography System (DIOS)

> **Статус:** принятый стандарт frontend · **Версия:** 1.0 · **Дата:** 2026-11-24  
> **Связано:** [UI_UX_DESIGN.md](UI_UX_DESIGN.md), `@dio/messenger-ui` (`src/icons/`)

## 1. Решение

| Параметр | Значение |
|---|---|
| Библиотека | `@phosphor-icons/react` |
| Базовый вес | `regular` |
| Активная навигация | `fill` выборочно |
| Собственные SVG | ITSM / AI / фирменные сценарии DIOS (~10%) |
| Базовый размер | 20 px |
| Цвета | семантические CSS-токены, не внутри SVG |
| Формат | SVG React-компоненты (не icon font) |
| Микс библиотек | запрещён |

Визуальный характер: **precise, quiet, slightly expressive**.

## 2. Размеры по контексту

| Контекст | SVG | Hit target |
|---|---:|---:|
| App rail / sidebar | 20–22 px | 40–44 px |
| Заголовок чата | 20 px | 36–40 px |
| Composer | 20–22 px | 40–44 px |
| Message actions | 16–18 px | 32–36 px (desktop) |
| Контекстное меню | 18 px | строка 36–40 px |
| Статусы доставки | 14–16 px | не интерактивные |
| Мобильные действия | 20–24 px | 44–48 px |

В коде: `ICON_CONTEXT_SIZE` / `ICON_SIZES` в `@dio/messenger-ui`.

## 3. Токены цвета

Определены в `packages/messenger-ui/src/tokens/icons.css`:

| Token | Роль |
|---|---|
| `--dio-icon-muted` | вторичные / декоративные |
| `--dio-icon-default` | обычные действия |
| `--dio-icon-strong` | hover / акцент текста |
| `--dio-icon-active` | выбранная навигация (адаптирован в dark) |
| `--dio-icon-danger` | ошибка / удаление / critical |
| `--dio-icon-disabled` | недоступно |
| `--dio-surface-hover` | подложка hover у `IconButton` |

Красный brand не копировать «как есть» в dark: active/danger поднимаются до `--dio-bright`-ряда.

## 4. API в `messenger-ui`

```text
packages/messenger-ui/src/
├── icons/
│   ├── AppIcon.tsx          # единая точка рендера
│   ├── iconRegistry.ts      # явный name → компонент
│   ├── types.ts
│   ├── custom/              # фирменные DIOS глифы
│   └── index.ts
├── components/
│   ├── Icon.tsx             # alias → AppIcon (совместимость)
│   └── IconButton/
└── tokens/
    └── icons.css
```

### AppIcon

```tsx
import { AppIcon } from "@dio/messenger-ui";

<AppIcon name="search" context="header" />
<AppIcon name="chat" size={20} filled />          // rail active
<AppIcon name="check-double" context="status" />
<AppIcon name="incident" tone="active" />       // custom
```

### IconButton

```tsx
import { IconButton } from "@dio/messenger-ui";

<IconButton label="Вложение" icon="attach" onClick={...} />
<IconButton label="Отправить" icon="send" variant="send" disabled={!canSend} />
```

Icon-only control **обязан** иметь `label` (accessible name). Tooltip не заменяет `aria-label`.

### Registry

Все имена — через `iconRegistry`. Чтобы заменить глиф, меняется одна запись; call sites не трогаем.

## 5. Карта имён (фрагмент)

| Name | Источник | Где |
|---|---|---|
| `chat` | Phosphor `ChatCircleDots` | rail |
| `search` | `MagnifyingGlass` | list / header |
| `people` | `Users` | rail |
| `send` | `PaperPlaneRight` | composer |
| `attach` | `Paperclip` | composer |
| `reply` | `ArrowBendUpLeft` | message actions |
| `copy` / `forward` | `Copy` / `ArrowFatRight` | message actions |
| `check` / `check-double` | `Check` / `Checks` | receipts |
| `clock` / `error` | `Clock` / `WarningCircle` | статусы |
| `incident` | custom | ITSM link |
| `ai-secretary` | custom | AI |
| `external-chat` | custom | внешний контур |
| `itsm-link` / `decision` | custom | domain |

## 6. Правила UX

- **Тихая навигация:** неактивные — muted/default; активные — fill + мягкая подложка; без цветных квадратов вокруг каждой иконки.
- **Список бесед:** главный якорь — аватар, не иконка чата; глифы только для pin / mute / external / incident.
- **Composer:** send — высшая иерархия; mic/send не прыгают по размеру при смене состояния.
- **Состояния:** hover 120–160 ms, focus-visible кольцо, disabled без реакции; без bounce/rotate на частых действиях.
- **Безопасность:** разные семантики (internal / external / restricted) — разные глифы, не один щит разного цвета.

## 7. Качество и аудит

Проверять глифы **в контексте UI**, не в изоляции:

1. Размеры 14 / 16 / 18 / 20 / 24 px (особенно 16–18).
2. Light / dark + hover / active / disabled.
3. Rail, composer, message toolbar, context menu.
4. Оптический вес рядом стоящих символов (скрепка, mic, search, send).
5. Браузер 100% и 125% zoom.

Рекомендуется внутренняя **icon audit** страница со всеми именами registry.

## 8. Что не делать

- Смешивать Lucide / Iconoir / Phosphor в одном экране.
- Класть brand color внутрь path fill без токена.
- Использовать icon font.
- Рисовать заново скрепку, поиск, шестерёнку «для уникальности».
- Делать liquid glass на каждой 20 px кнопке.
