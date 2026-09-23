/**
 * Marketaux — gratis 100 llamadas/día. Noticias con sentimiento por entidad.
 * Último respaldo de noticias (después de Polygon y Alpha Vantage). Cada llamada pasa por el
 * cupo propio (80/día, ver cupo.ts): así nunca se llega al límite ni llega el correo de aviso.
 */
import { fetchJson, env, ProviderError } from "./http";
import { reservarCupo, CUPO } from "./cupo";
import { cached } from "./cache";
import type { NewsItem } from "@/lib/analysis/types";
import { labelFromScore } from "./alphavantage";
import { isNum } from "@/lib/format";

export const marketauxEnabled = () => !!env.marketaux();

interface MXResp {
  data?: Array<{
    uuid: string;
    title: string;
    description?: string;
    url: string;
    image_url?: string;
    published_at: string;
    source: string;
    entities?: Array<{ symbol: string; sentiment_score?: number; match_score?: number; industry?: string }>;
  }>;
  error?: { code: string; message: string };
}

export async function marketauxNews(symbol: string): Promise<NewsItem[]> {
  const key = env.marketaux();
  if (!key) throw new ProviderError("marketaux", 401, "sin MARKETAUX_API_KEY");
  return cached(`mx:news:${symbol}`, 6 * 3600 * 1000, async () => {
    if (!(await reservarCupo("marketaux"))) throw new ProviderError("marketaux", 429, `cupo propio del día agotado (tope ${CUPO.marketaux})`);
    const url = `https://api.marketaux.com/v1/news/all?symbols=${encodeURIComponent(symbol)}&filter_entities=true&language=en&limit=20&api_token=${key}`;
    const d = await fetchJson<MXResp>("marketaux", url, { timeoutMs: 8000 });
    if (d.error) throw new ProviderError("marketaux", 429, d.error.message);
    return (d.data ?? []).map((n) => {
      const ent = n.entities?.find((e) => e.symbol?.toUpperCase() === symbol.toUpperCase());
      const score = ent && isNum(ent.sentiment_score) ? ent.sentiment_score : 0;
      return {
        id: n.uuid,
        title: n.title,
        summary: n.description,
        url: n.url,
        source: n.source,
        publishedAt: new Date(n.published_at).getTime(),
        image: n.image_url || undefined,
        topics: [],
        sentiment: { score, label: labelFromScore(score), relevance: ent?.match_score ?? null, provider: "marketaux" as const },
      };
    });
  });
}

/** Noticias generales de mercado (sin símbolo), con sentimiento de la entidad principal. */
export async function marketauxGeneral(): Promise<NewsItem[]> {
  const key = env.marketaux();
  if (!key) throw new ProviderError("marketaux", 401, "sin MARKETAUX_API_KEY");
  // 3 horas: la página de Noticias no necesita más frescura y cada consulta gasta cupo.
  return cached("mx:news:general", 3 * 3600 * 1000, async () => {
    if (!(await reservarCupo("marketaux"))) throw new ProviderError("marketaux", 429, `cupo propio del día agotado (tope ${CUPO.marketaux})`);
    const url = `https://api.marketaux.com/v1/news/all?countries=us&filter_entities=true&language=en&limit=30&api_token=${key}`;
    const d = await fetchJson<MXResp>("marketaux", url, { timeoutMs: 8000 });
    if (d.error) throw new ProviderError("marketaux", 429, d.error.message);
    return (d.data ?? []).map((n) => {
      const ent = n.entities?.[0];
      const score = ent && isNum(ent.sentiment_score) ? ent.sentiment_score : 0;
      return { id: n.uuid, title: n.title, summary: n.description, url: n.url, source: n.source, publishedAt: new Date(n.published_at).getTime(), image: n.image_url || undefined, topics: [], sentiment: { score, label: labelFromScore(score), relevance: ent?.match_score ?? null, provider: "marketaux" as const } };
    });
  });
}
