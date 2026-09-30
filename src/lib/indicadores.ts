/** EMA de k períodos (semilla: primer valor). */
export const ema = (c: number[], k: number) => {
  const a = 2 / (k + 1);
  const out: number[] = [];
  c.forEach((v, i) => out.push(i ? v * a + out[i - 1] * (1 - a) : v));
  return out;
};

/** Bandas de Bollinger: media simple de n períodos ± m desviaciones estándar (null hasta tener n datos). */
export const bollinger = (c: number[], n = 20, m = 2) =>
  c.map((_, i) => {
    if (i < n - 1) return null;
    const w = c.slice(i - n + 1, i + 1);
    const mid = w.reduce((x, y) => x + y, 0) / n;
    const sd = Math.sqrt(w.reduce((x, y) => x + (y - mid) ** 2, 0) / n);
    return { mid, up: mid + m * sd, dn: mid - m * sd };
  });
