import type { Evaluation } from "@/lib/analysis/types";
import { UNIVERSO, pendientes } from "@/lib/universo";

/**
 * Ranking por calificación. Cada evaluación deja su resultado en la tabla `ranking` de
 * Supabase; el top se lee de ahí. No hay datos personales: leerla es público y escribir
 * pasa por una función que solo acepta una fila por ticker.
 * Un job diario (`/api/cron/ranking`) reevalúa todo el universo con precio y Fair Value del día.
 */
const cfg = () => ({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY });

export interface RankingRow {
  ticker: string;
  nombre: string | null;
  sector: string | null;
  precio: number | null;
  market_cap: number | null;
  fair_value: number | null;
  mos: number | null;
  score: number;
  grade: string | null;
  senal: string | null;
  senal_key: string | null;
  fwd_pe: number | null;
  proximo_earnings: string | null;
  actualizado: string;
}

/** Guarda la calificación. Nunca falla hacia afuera: el ranking es secundario. */
export async function guardarRanking(ev: Evaluation): Promise<void> {
  const { url, key } = cfg();
  if (!url || !key) return;
  const n = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);
  try {
    await fetch(`${url}/rest/v1/rpc/ranking_upsert`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_ticker: ev.symbol,
        p_nombre: ev.profile.name,
        p_sector: ev.profile.sector ?? null,
        p_precio: n(ev.quote.price),
        p_fair_value: n(ev.valuation.intrinsic.blended),
        p_mos: n(ev.valuation.marginOfSafety),
        p_score: Math.round(ev.score.total),
        p_grade: ev.score.grade,
        p_senal: ev.score.signal.label,
        p_senal_key: ev.score.signal.key,
        p_market_cap: n(ev.metrics.marketCap),
        p_fwd_pe: n(ev.valuation.multiples.forwardPe),
        p_proximo_earnings: ev.earningsCalendar?.nextDate ?? null,
      }),
    });
  } catch {
    /* sin ranking no pasa nada */
  }
}

/** Top por score. Solo evaluaciones de los últimos 14 días: una calificación vieja no es una calificación. */
export async function leerRanking(limit = 20): Promise<RankingRow[]> {
  const { url, key } = cfg();
  if (!url || !key) return [];
  const desde = new Date(Date.now() - 14 * 86400000).toISOString();
  const r = await fetch(`${url}/rest/v1/ranking?select=*&actualizado=gte.${encodeURIComponent(desde)}&order=score.desc,mos.desc&limit=${limit}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!r.ok) return [];
  return (await r.json()) as RankingRow[];
}

/** Tickers que el job diario debe reevaluar ahora (ver `pendientes` en universo.ts). */
export async function rankingPendientes(horas: number, omitir: string[] = []): Promise<string[]> {
  const { url, key } = cfg();
  if (!url || !key) throw new Error("Sin SUPABASE_URL / SUPABASE_KEY");
  const r = await fetch(`${url}/rest/v1/ranking?select=ticker,actualizado&limit=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`ranking: HTTP ${r.status}`);
  const filas = (await r.json()) as Pick<RankingRow, "ticker" | "actualizado">[];
  return pendientes(filas, UNIVERSO, omitir, horas, Date.now());
}
