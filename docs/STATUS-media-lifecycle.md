# Status: Media lifecycle (Session 4)

- **Дата:** 2026-11-22
- **Решение:** [DEC-0012](decisions/DEC-0012-media-lifecycle-worker.md)

## Сделано

| Компонент | Назначение |
|---|---|
| `POST …/uploads/{id}/complete` | S3 head + `pending` → `uploaded`, promote staging → original |
| `python -m src.infra.media.worker` | scan queue, `uploaded`/`scanning` → `ready`/`rejected` |
| `MediaStatus.SCANNING` | worker claim / in-flight validation |
| `src/application/media/validation.py` | magic-byte sniff, EICAR stub AV |
| `src/application/media/processing.py` | read prefix from S3, validate, optional thumbnail stub |

## Поведение

- **Ready:** sniff OK, AV clean, optional `meta` (stub 1×1 для image).
- **Rejected:** `meta.rejection.reason` (+ `code`); attach к сообщению запрещён.
- **Worker env:** `MEDIA_WORKER_POLL_INTERVAL`, `MEDIA_WORKER_BATCH_SIZE`.

## Тесты

`messenger.back/tests/unit/test_media_lifecycle.py` — domain transitions и validation helpers.

## Smoke

`e2e_smoke.py` — после complete ожидает `uploaded`, затем poll до `ready` (worker должен быть запущен).