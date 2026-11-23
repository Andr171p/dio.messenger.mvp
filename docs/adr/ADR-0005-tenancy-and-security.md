# ADR-0005 — Organization ownership, guests, security и шифрование

- **Статус:** Accepted
- **Дата:** 2026-11-22
- **Контекст:** [ARCHITECTURE.md](../architecture/ARCHITECTURE.md), разделы 12–13

## Контекст

В беседе могут находиться сотрудники, заказчики и подрядчики. Политики компании должны контролировать файлы, пересылку, редактирование и AI, а Messenger — интегрироваться с IAM и ITSM, не создавая утечек между организациями.

## Решение

- Одна conversation принадлежит одной организации, внешние участники приглашаются явно с ограниченной membership.
- DIO IAM для identity и организации; серверный resource-level authorization для conversation/message/attachment/context.
- Default deny, explicit policy overrides, обязательные org restrictions нельзя ослабить conversation override.
- UI всегда сообщает о внешних участниках; join/leave и membership изменения проходят audit.
- No E2EE в MVP; TLS + encryption at rest + access auditing + protected backup/secrets. Сервер может обрабатывать plaintext для разрешённых функций.
- AI disabled by default в customer conversations; включение — только с подходящим соглашением и policy.
- В браузере нельзя гарантировать запрет screenshot/copy; не позиционировать как абсолютный DLP.
- Attachments имеют статус сканирования и не раздаются до завершения обязательных проверок.

## Trade-offs

- No E2EE упрощает поиск, compliance и AI, но требует повышенного доверия к серверу и governance.
- Guest membership требует строгой логики history visibility и проверки preview ITSM ресурсов.
- Offline cached content может остаться на отключённом устройстве после revocation; нужны организационные policy и явные UX/security constraints.
