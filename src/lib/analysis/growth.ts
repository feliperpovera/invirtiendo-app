import type { Metrics, N } from "./types";
import type { Derived } from "./fundamentals";
import { isNum, clamp, avg } from "@/lib/format";

/**
 * UNA sola estimación de crecimiento de utilidades para toda la app
 * (DCF, Fair Value Lynch, PEG). Mezcla estimación de analistas (pesa doble),
 * EPS 5 años y utilidad neta 5 años, con recorte conservador del 15%.
 */
export function expectedGrowth(d: Derived, m: Metrics, opts: { cyclical: boolean }): { g: N; raw: N; sources: string[]; inputs: Record<string, N> } {
  const cands: Array<[N, number, string]> = [
    [m.growthEstimate, 2, "analistas"],
    [m.epsGrowth5Y ?? d.growth.eps5y, 1, "EPS 5a"],
    [d.growth.netIncome5y, 1, "utilidad 5a"],
    [d.growth.revenue3y, 1, "ingresos 3a"],
    [m.revenueGrowth5Y ?? d.growth.revenue5y, 0.5, "ingresos 5a"],
  ];
  const ok = cands.filter(([v]) => isNum(v)) as Array<[number, number, string]>;
  const inputs: Record<string, N> = Object.fromEntries(cands.map(([v, , s]) => [s, v]));
  if (!ok.length) return { g: null, raw: null, sources: [], inputs };
  const w = ok.reduce((s, [, x]) => s + x, 0);
  const raw = ok.reduce((s, [v, x]) => s + clamp(v, -30, 80) * x, 0) / w;
  const cap = opts.cyclical ? 15 : 30;
  const g = clamp(raw * 0.85, -10, cap);
  return { g: Math.round(g * 10) / 10, raw: Math.round(raw * 10) / 10, sources: ok.map(([, , s]) => s), inputs };
}

/**
 * P/E justo estilo Lynch: crecimiento + dividendo + prima de calidad medible
 * (ROIC ≥ 25% con márgenes estables: +5 · caja neta: +3), acotado 10-25x.
 */
export function fairPe(g: N, dividendYield: N, quality?: { roic: N; gmStdev: N; netCash: N; debtToEquity?: N }): N {
  if (!isNum(g)) return null;
  let bonus = 0;
  if (quality) {
    if (isNum(quality.roic) && quality.roic >= 25 && (!isNum(quality.gmStdev) || quality.gmStdev <= 4)) bonus += 5;
    // La etiqueta de deuda del 10-K a veces trae solo una parte (Oracle: $7B de $96B).
    // Deuda/patrimonio por encima de 1 desmiente cualquier "caja neta" calculada.
    const apalancada = isNum(quality.debtToEquity) && quality.debtToEquity > 1;
    if (isNum(quality.netCash) && quality.netCash > 0 && !apalancada) bonus += 3;
  }
  return clamp(g + (isNum(dividendYield) ? dividendYield : 0) + bonus, 10, 25);
}

export const _avg = avg;
