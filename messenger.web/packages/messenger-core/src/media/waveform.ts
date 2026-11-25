/**
 * Преобразование канонического waveform (массив нормализованных амплитуд)
 * к нужному числу столбиков для отображения. Один массив на все размеры плеера.
 *
 * Для уменьшения числа баров соседние интервалы агрегируются по RMS.
 * Для увеличения — значения линейно интерполируются.
 */

export function resampleWaveform(samples: number[], barCount: number): number[] {
  if (barCount <= 0) return [];
  if (!samples.length) return new Array(barCount).fill(0);
  if (barCount === samples.length) return samples.slice();

  const source = samples.slice();
  if (barCount > source.length) {
    // Линейная интерполяция вверх.
    const result = new Array<number>(barCount);
    for (let i = 0; i < barCount; i++) {
      const position = (i * (source.length - 1)) / (barCount - 1 || 1);
      const low = Math.floor(position);
      const high = Math.min(low + 1, source.length - 1);
      const fraction = position - low;
      result[i] = Math.round(source[low]! * (1 - fraction) + source[high]! * fraction);
    }
    return result;
  }

  // RMS-агрегация вниз.
  const result = new Array<number>(barCount);
  for (let i = 0; i < barCount; i++) {
    const start = (i * source.length) / barCount;
    const end = ((i + 1) * source.length) / barCount;
    const first = Math.floor(start);
    const last = Math.min(source.length, Math.ceil(end));
    let sum = 0;
    let count = 0;
    for (let j = first; j < last; j++) {
      const value = source[j]!;
      sum += value * value;
      count++;
    }
    result[i] = count ? Math.round(Math.sqrt(sum / count)) : 0;
  }
  return result;
}
