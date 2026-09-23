import type { QuarterRow, N } from "./types";
import { isNum } from "@/lib/format";

export interface FvPoint {
  t: number; // ms
  fv: number; // fair value estimado en esa fecha
  lo: number; // banda inferior
  hi: number; // banda superior
}

export interface FvHistory {
  /** Serie de Fair Value (escalonada: cambia con cada reporte trimestral) */
  points: FvPoint[];
  /** Fechas de publicación de resultados */
  earnings: number[];
  /** Próxima fecha de resultados */
  nextEarnings: number | null;
  /** Fair Value de hoy del modelo (usa EPS estimado a 12 meses) */
  fairValueNow: N;
  /** Fair Value proyectado a 12 meses con el crecimiento estimado */
  targetOwn: N;
  /** Precio objetivo promedio de analistas */
  targetAnalyst: N;
  targetDate: number; // ms
  band: number; // ancho de la banda (±%)
}

/**
 * Reconstruye el Fair Value histórico: para cada trimestre reportado calcula el
 * EPS de los últimos 12 meses y lo multiplica por el P/E justo actual. Da la
 * línea escalonada que muestra si la acción cotizaba cara o barata en cada momento.
 */
export function buildFvHistory(
  quarterly: QuarterRow[],
  opts: { fairPe: N; fairValueNow: N; growth: N; analystTarget: N; nextEarnings?: string | null; band?: number; epsScale?: number; soloReferencia?: boolean },
): FvHistory | null {
  const band = opts.band ?? 0.22;
  const targetDate = Date.now() + 365 * 86400000;
  const growth = isNum(opts.growth) ? Math.max(-20, Math.min(40, opts.growth)) : 8;
  const targetOwn = isNum(opts.fairValueNow) ? opts.fairValueNow * (1 + growth / 100) : null;

  const q = quarterly.filter((x) => isNum(x.epsDiluted)).sort((a, b) => a.end.localeCompare(b.end));
  const points: FvPoint[] = [];
  const earnings: number[] = [];

  if (isNum(opts.fairPe) && q.length >= 5 && !opts.soloReferencia) {
    for (let i = 3; i < q.length; i++) {
      const ttm = q.slice(i - 3, i + 1).reduce((s, x) => s + (x.epsDiluted as number), 0);
      // Los resultados se publican ~5 semanas después del cierre del trimestre
      const t = new Date(q[i].end).getTime() + 35 * 86400000;
      earnings.push(t);
      if (ttm <= 0) continue;
      // Mismo modelo que la tarjeta: EPS × P/E justo. epsScale lleva el EPS
      // reportado a la misma base (estimado a 12 meses) que usa el Fair Value de hoy.
      const fv = ttm * (opts.fairPe as number) * (opts.epsScale ?? 1);
      const last = points[points.length - 1];
      if (last && t - last.t < 45 * 86400000) points[points.length - 1] = { t, fv, lo: fv * (1 - band), hi: fv * (1 + band) };
      else points.push({ t, fv, lo: fv * (1 - band), hi: fv * (1 + band) });
    }
  }

  // Sin Fair Value en la tarjeta (empresa en pérdidas) no se dibuja línea: el
  // gráfico no puede sugerir un valor que el modelo se niega a dar.
  if (!isNum(opts.fairValueNow)) return null;
  // El último punto ES el Fair Value de la tarjeta: una sola cifra en toda la app.
  if (isNum(opts.fairValueNow)) {
    const fv = opts.fairValueNow;
    const last = points[points.length - 1];
    const p = { t: Date.now(), fv, lo: fv * (1 - band), hi: fv * (1 + band) };
    if (last && Date.now() - last.t < 45 * 86400000) points[points.length - 1] = p;
    else points.push(p);
  }
  if (points.length < 2) points.length = 0; // sin historia: solo referencia de hoy

  points.sort((a, b) => a.t - b.t);
  const nextEarnings = opts.nextEarnings ? new Date(opts.nextEarnings).getTime() : null;
  return { points, earnings, nextEarnings, fairValueNow: opts.fairValueNow, targetOwn, targetAnalyst: opts.analystTarget, targetDate, band };
}
