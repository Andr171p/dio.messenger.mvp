# Пилотный деплой DIO Messenger

Docker Compose запускает на одном хосте Nginx с production-сборкой PWA, API, PostgreSQL, Redis, RabbitMQ, RustFS и четыре фоновых процесса. Alembic и создание приватного бакета выполняются при запуске. API и воркеры ждут успешных миграций и готовности своих зависимостей. DioDesk/IAM разворачивается отдельно и нужен для входа и операций с заявками.

## Подготовка хоста

- Linux с Docker Engine 28+ и Compose 2.24.4+ для изоляции опубликованного порта и поддержки Compose `include` и `!reset`. Для сборки нужен доступ к реестрам образов, PyPI, npm и Git-репозиторию `py-ddd-framework`.
- DNS и TLS для публичного адреса Messenger. HTTPS ingress на Docker-хосте должен отправлять запросы на `http://127.0.0.1:8080`. В Compose только Nginx публикует порт, привязанный к loopback. Точка входа через HTTPS нужна для PWA, WSS и работы с медиа.
- Экземпляр DioDesk/IAM, доступный из контейнеров, и браузерные HTTPS-адреса DioDesk API и Web. При разных origin настройте на стороне DioDesk API CORS для точного origin Messenger. Для приёмки нужны два тестовых аккаунта с доступом к одной беседе.

## Настройка и запуск

Из корня репозитория выполните команды.

```bash
cp docker/.env.pilot.example docker/.env.pilot
chmod 600 docker/.env.pilot
cp docker/frontend/messenger-runtime.pilot.example.json docker/frontend/messenger-runtime.pilot.json
```

В `docker/.env.pilot` задайте `PILOT_ORIGIN` как точный внешний origin без пути и завершающего слеша. Укажите `SRV_IAM_BASE_URL`, доступный из контейнеров. При отдельном адресе API заявок задайте `DIODESK_BASE_URL`. Заполните каждое поле учётных данных отдельным случайным значением. Для совместимости со строками подключения можно использовать hex из `openssl rand -hex 24`. Укажите SHA выкладываемого коммита в `MESSENGER_RELEASE`. SHA используется в тегах образов и в `/release.json`.

В `docker/frontend/messenger-runtime.pilot.json` укажите публичные `deskApi` и `deskWeb`. `messengerApi` со значением `/` направляет REST и WebSocket на origin PWA. Файл доступен браузеру и содержит публичную конфигурацию. Если ingress уже проксирует DioDesk `/api/v1/` на том же origin, можно указать `deskApi` со значением `/`. Опциональное поле `telemetry` настраивает [клиентскую телеметрию](../development/FRONTEND_RELEASE.md).

В HTTPS ingress передавайте исходный `Host` с портом, если он есть, и задавайте `X-Forwarded-Proto: https`. Поддержите WebSocket Upgrade и таймаут ожидания чтения не менее 90 секунд. Передавайте URI и query без изменения, иначе RustFS не примет подпись ссылки. Разрешите тело запроса до 50 МиБ, исключите кеширование `/v1/` и `/messenger-media/`. Исключите query string из логов ingress для `/v1/ws` и `/messenger-media/`, где могут быть одноразовые билеты и подписи. TLS и HSTS настраиваются на ingress.

```bash
docker compose --env-file docker/.env.pilot -f docker/compose.yml up --build --wait --wait-timeout 240
```

Для разработки используется корневой `docker-compose.yml` с портами инфраструктуры. Пилотный Compose использует отдельное имя проекта и собственные именованные тома.

## Проверка перед допуском пользователей

```bash
docker compose --env-file docker/.env.pilot -f docker/compose.yml ps -a
docker compose --env-file docker/.env.pilot -f docker/compose.yml logs --tail=100 migrate storage-init api outbox-relay media-worker scheduled-worker retention-worker
curl --fail https://messenger.example.invalid/health/ready
curl --fail https://messenger.example.invalid/release.json
```

- `migrate` и `storage-init` завершились с кодом `0`. API, фронтенд и инфраструктура прошли healthcheck. У воркеров нет циклических рестартов. `/health/ready` проверяет ответ API, а сценарии ниже проверяют внешние зависимости и обработку данных.
- Войти под двумя пилотными аккаунтами через реальный DioDesk. Проверить доставку сообщений в обе стороны, WSS reconnect, восстановление истории после разрыва сети и очистку после отзыва доступа. Проверить запланированное сообщение, загрузку и скачивание вложения, голосовое сообщение и истечение подписанной ссылки. Для ITSM проверить открытие заявки и права сотрудника и гостя. [Инструкция выпуска фронтенда](../development/FRONTEND_RELEASE.md)
- Согласовать политику сессии и общих устройств. Legacy-адаптер DioDesk хранит refresh-токен в `localStorage`, а черновики и очередь остаются в IndexedDB после выхода. До допуска пользователей принять решение по HttpOnly refresh-cookie и очистке локальных данных. [Условия выпуска фронтенда](../development/FRONTEND_RELEASE.md)
- Проверить запас диска, ротацию логов, оповещения о недоступности приложения и рестартах воркеров. Метрики API доступны в сети Compose по `http://api:8002/v1/system/metrics`. Сверить сроки хранения событий и tombstone с требованиями пилота. По умолчанию они составляют 90 дней, а минимальный остаток истории на беседу составляет 1000 событий.
- Снять резервную копию PostgreSQL и объектов RustFS и проверить восстановление на отдельном стенде. Согласовать частоту копий, ожидаемое время восстановления и владельца пилота. Этот стек работает на одном хосте и имеет общий домен отказа.

## Обновление и откат

Перед обновлением сохраните предыдущие образы, настройки, резервные копии БД и объектов. Обновите checkout и `MESSENGER_RELEASE`, затем повторите команду запуска. Сохраните доступ к хэшированным файлам прошлой сборки на время перехода. [Инструкция выпуска фронтенда](../development/FRONTEND_RELEASE.md)

Если новая схема БД совместима с предыдущими образами, верните предыдущий `MESSENGER_RELEASE` и конфигурацию, затем выполните команду.

```bash
docker compose --env-file docker/.env.pilot -f docker/compose.yml up --no-build --no-deps --wait api outbox-relay media-worker scheduled-worker retention-worker frontend
```

При несовместимых миграциях согласуйте окно и судьбу новых записей. Восстановите согласованные копии БД и RustFS на предыдущей версии и повторите приёмку. Для остановки используйте `docker compose --env-file docker/.env.pilot -f docker/compose.yml down`. Опция `--volumes` удаляет именованные тома с данными.
