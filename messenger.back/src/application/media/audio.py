"""Извлечение аудио-метаданных: ffmpeg (PCM → длительность + waveform).

Длительность считается из декодированного PCM (без второго подпроцесса).
ffprobe подключается только если PCM был обрезан потолком — очень длинные
записи, где контейнерный заголовок даёт точную длительность без полного декода.
"""

import array
import asyncio
from math import sqrt

# Потолок декодированного PCM для waveform (~17.5 мин при 8 kHz mono s16le).
# Длиннее — waveform обрезается, а длительность досчитывается через ffprobe.
_MAX_WAVEFORM_PCM_BYTES = 16 * 1024 * 1024

_CHUNK = 64 * 1024


async def probe_duration_ms(path: str, *, ffprobe_path: str) -> int:
    """Длительность файла в миллисекундах (ffprobe). Raises on failure."""
    proc = await asyncio.create_subprocess_exec(
        ffprobe_path,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        path,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await proc.communicate()
    if proc.returncode != 0:
        detail = err.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"ffprobe failed: {detail}")
    lines = out.decode("ascii", errors="ignore").strip().splitlines()
    if not lines:
        raise RuntimeError("ffprobe returned no duration.")
    return round(float(lines[0]) * 1000)


async def decode_mono_pcm(
    path: str,
    *,
    ffmpeg_path: str,
    sample_rate: int,
    max_bytes: int = _MAX_WAVEFORM_PCM_BYTES,
) -> tuple[bytes, bool]:
    """Декодирует аудио в mono s16le PCM (little-endian), не более ``max_bytes``.

    Возвращает ``(pcm, truncated)``, где ``truncated`` означает, что вход был
    длиннее ``max_bytes`` и PCM обрезан.
    """
    proc = await asyncio.create_subprocess_exec(
        ffmpeg_path,
        "-v",
        "error",
        "-nostdin",
        "-i",
        path,
        "-vn",
        "-f",
        "s16le",
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "pipe:1",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    assert proc.stdout is not None
    chunks: list[bytes] = []
    total = 0
    truncated = False
    while True:
        chunk = await proc.stdout.read(_CHUNK)
        if not chunk:
            break
        if total + len(chunk) > max_bytes:
            truncated = True
            chunk = chunk[: max_bytes - total]
        chunks.append(chunk)
        total += len(chunk)
        if total >= max_bytes:
            break
    # Досчитываем stdout, чтобы ffmpeg не заблокировался на заполненном пайпе.
    while await proc.stdout.read(_CHUNK):
        pass
    err = await proc.stderr.read()
    code = await proc.wait()
    if code != 0:
        detail = err.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"ffmpeg failed: {detail}")
    return b"".join(chunks), truncated


def pcm_duration_ms(pcm: bytes, sample_rate: int) -> int:
    """Длительность mono s16le PCM в миллисекундах."""
    return (len(pcm) // 2) * 1000 // sample_rate


def rms_envelope_from_pcm(pcm: bytes, bar_count: int) -> list[int]:
    """RMS-огибающая mono s16le PCM → ``bar_count`` значений, нормализованных 0–100.

    Массив ``array('h')`` интерпретирует s16le как little-endian на LE-хостах
    (x86-64/ARM64), что соответствует выводу ffmpeg. Собирает sum-of-squares и
    счётчик по барам за один проход без материализации списка всех сэмплов.
    """
    sample_count = len(pcm) // 2
    if sample_count == 0 or bar_count <= 0:
        return []
    bar_count = min(bar_count, sample_count)
    sums = [0] * bar_count
    counts = [0] * bar_count

    samples = array.array("h")
    samples.frombytes(pcm[: sample_count * 2])
    for index, value in enumerate(samples):
        bar = (index * bar_count) // sample_count
        if bar >= bar_count:
            bar = bar_count - 1
        sums[bar] += value * value
        counts[bar] += 1

    rms = [
        int(sqrt(sums[i] / counts[i])) if counts[i] else 0
        for i in range(bar_count)
    ]
    peak = max(rms)
    if peak <= 0:
        return [0] * bar_count
    return [round(value * 100 / peak) for value in rms]


async def extract_audio_meta(
    path: str,
    *,
    ffmpeg_path: str,
    ffprobe_path: str,
    sample_rate: int,
    bar_count: int,
) -> tuple[int, list[int] | None]:
    """Длительность (мс) и waveform из одного ffmpeg-декода.

    Длительность считается из PCM; ffprobe — только как fallback, если PCM был
    обрезан потолком (очень длинные записи). Waveform — ``None`` при пустом PCM.
    """
    pcm, truncated = await decode_mono_pcm(
        path,
        ffmpeg_path=ffmpeg_path,
        sample_rate=sample_rate,
    )
    if truncated:
        duration_ms = await probe_duration_ms(path, ffprobe_path=ffprobe_path)
    else:
        duration_ms = pcm_duration_ms(pcm, sample_rate)
    waveform = rms_envelope_from_pcm(pcm, bar_count) if pcm else None
    return duration_ms, waveform
