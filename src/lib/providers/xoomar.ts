/**
 * XOOMAR — datos de mercado de fuentes primarias (FINRA, Tesoro de EE. UU.), sin llave.
 * Catálogo public-apis · https://xoomar.com/markets/api
 *
 * Límite: 30 consultas por minuto por IP sin llave. Todo va con caché larga (el short
 * interest de FINRA sale cada quince días y la curva una vez al día) y con timeout corto:
 * si XOOMAR tarda o falla, la evaluación sigue sin estos datos.
 *
 * Condición de uso: citar a XOOMAR con enlace a la página del dataset al republicar.
 * Los enlaces están en lib/atribucion.ts y se muestran junto a cada dato.
 */
import { fetchJson } from "./http";
import { cached } from "./cache";
import { isNum } from "@/lib/format";
import type { ShortInterest, YieldCurve } from "@/lib/analysis/types";

const BASE = "https://xoomar.com/api/markets";
const HORA = 3600 * 1000;
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

interface SiRow { settlementDate: string; symbol: string; shortQty: number; avgDailyVol: number; daysToCover: string; changePct: string }

/** Interés en corto de FINRA para un ticker, del reporte más reciente hacia atrás. */
export function xoomarShortInterest(symbol: string): Promise<ShortInterest | null> {
  return cached(`xoomar:si:${symbol}`, 12 * HORA, async () => {
    const r = await fetchJson<{ data?: SiRow[] }>("xoomar", `${BASE}/short-interest?symbol=${encodeURIComponent(symbol)}`, { timeoutMs: 5000 });
    const rows = (r.data ?? []).filter((x) => x.symbol?.toUpperCase() === symbol.toUpperCase() && isNum(x.shortQty));
    if (!rows.length) return null;
    const [ultimo, ...antes] = rows;
    return {
      settlementDate: ultimo.settlementDate,
      shortQty: ultimo.shortQty,
      daysToCover: num(ultimo.daysToCover),
      changePct: num(ultimo.changePct),
      history: antes.slice(0, 6).map((x) => ({ settlementDate: x.settlementDate, shortQty: x.shortQty, daysToCover: num(x.daysToCover) })),
    };
  });
}

type CurveRow = Record<"date" | "m3" | "y2" | "y10" | "y30", string>;

/** Curva del Tesoro del último día hábil publicado. */
export function xoomarYieldCurve(): Promise<YieldCurve | null> {
  return cached("xoomar:curve", 3 * HORA, async () => {
    const desde = new Date(Date.now() - 12 * 86400000).toISOString().slice(0, 10);
    const r = await fetchJson<{ data?: CurveRow[] }>("xoomar", `${BASE}/macro?series=yield-curve&from=${desde}`, { timeoutMs: 5000 });
    const d = [...(r.data ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!d) return null;
    const y2 = num(d.y2);
    const y10 = num(d.y10);
    return {
      date: d.date,
      m3: num(d.m3),
      y2,
      y10,
      y30: num(d.y30),
      spread10y2y: isNum(y10) && isNum(y2) ? Math.round((y10 - y2) * 100) / 100 : null,
    };
  });
}
