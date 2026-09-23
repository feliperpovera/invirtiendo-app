/**
 * Sentimiento de r/wallstreetbets (Tradestie), sin llave. Catálogo public-apis, sección Finance
 * ("WallstreetBets"). Devuelve las ~50 acciones más comentadas del día con su sentimiento.
 *
 * Es contexto, no dato de valoración: mide el ánimo de inversionistas minoristas en un foro,
 * no el negocio. No entra al score. Una sola consulta sirve para todas las acciones (se cachea
 * la lista completa), así que no crece con el número de evaluaciones.
 */
import { fetchJson } from "./http";
import { cached } from "./cache";
import type { WsbSentiment } from "@/lib/analysis/types";

interface Row { ticker: string; sentiment: string; sentiment_score: number; no_of_comments: number }

function wsbHoy(): Promise<Row[]> {
  return cached("wsb:hoy", 3 * 3600 * 1000, async () => {
    const r = await fetchJson<Row[]>("tradestie", "https://tradestie.com/api/v1/apps/reddit", { timeoutMs: 5000, headers: { "User-Agent": "Mozilla/5.0" } });
    return Array.isArray(r) ? r : [];
  });
}

/** El sentimiento del día para un ticker, o null si no está entre los más comentados. */
export async function wsbSentiment(symbol: string): Promise<WsbSentiment | null> {
  const filas = [...(await wsbHoy())].sort((a, b) => b.no_of_comments - a.no_of_comments);
  const i = filas.findIndex((f) => f.ticker?.toUpperCase() === symbol.toUpperCase());
  if (i < 0) return null;
  const f = filas[i];
  return { sentiment: f.sentiment, score: f.sentiment_score, comments: f.no_of_comments, rank: i + 1, of: filas.length };
}
