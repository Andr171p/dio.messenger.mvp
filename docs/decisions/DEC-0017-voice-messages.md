# DEC-0017 — Voice messages (голосовые сообщения)

- **Статус:** Accepted
- **Дата:** 2026-11-25
- **Тип:** working decision
- **Контекст:** существующий media-pipeline (DEC-0003, DEC-0012) и content blocks уже покрывают upload/обработку/доставку медиа.

## Решение

1. **Нет отдельной сущности `VoiceMessage` и `Waveform`.** Голосовое — обычный `MediaAsset` + желаемое представление `presentation` на `MediaBlock`. Байты — в S3, waveform — в `MediaAsset.meta` JSONB.
2. **`MediaPresentation`** (`file`/`image`/`video`/`voice`/`video_note`) на `MediaBlock`; wire-форма `{"type":"media","assetId":...,"presentation":...}`. Дефолтный `file` в JSON не пишется (обратная совместимость контракта). Учитывается в content-fingerprint/идемпотентности.
3. **Валидация совместимости** `presentation` ↔ `content_type` на отправке/редактировании: `voice → audio/*`, `video_note/video → video/*`, `image → image/*`, `file → *`.
4. **Канонические метаданные на backend** (Media Worker): ffprobe — обязательная `duration_ms`; ffmpeg — RMS-огибающая `waveform` (96 баров, нормализация 0–100), best-effort. `AudioMeta` = `{type:"audio", durationMs, waveform?}`. Отсутствие waveform не блокирует `READY`; сбой ffprobe → `rejected` (`audio_processing_failed`).
5. **Frontend считает live waveform + таймер** через Web Audio API (`AnalyserNode`) только для записи/превью; канонические значения читает из `meta` после `READY`. `resampleWaveform` адаптирует один массив к любой ширине плеера.
6. **Safari `audio/mp4`**: разрешённый тип + sniff по ftyp-бренду `M4A ` + исключение пары `audio/mp4`↔`video/mp4` (ISO-BMFF; точный stream-тип подтверждает ffprobe).
7. **Offline-persist**: незавершённая запись хранится в IndexedDB (`voiceUploads`, Dexie schema v2), возобновляется после reload/reconnect через существующий `MediaUploadManager` + presigned S3.
8. **Нет нового WS-события**: доставка через обычный `message.created` с блоком `presentation:"voice"`.

## Последствия

- Жёсткого лимита длительности нет — действует только `max_upload_bytes` (50 МБ).
- В окружении Media Worker требуются `ffprobe`/`ffmpeg` (`MEDIA_FFMPEG_PATH`/`MEDIA_FFPROBE_PATH` для переопределения; иначе поиск в PATH).
- `video_note` (видеокружки) — следующий этап, без изменения архитектуры.
