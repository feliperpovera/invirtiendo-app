/**
 * Polygon.io (Massive) — plan Basic gratis: 5 llamadas por minuto, SIN tope diario.
 * El endpoint de noticias incluye `insights`: sentimiento por ticker (positive /
 * neutral / negative) con el razonamiento en texto. Es la fuente de sentimiento
 * más generosa de las gratuitas (~7.000 llamadas/día contra las 100 de Marketaux).
 */
import { fetchJson, env, ProviderError } from "./http";
import { cached, TTL } from "./cache";
import type { NewsItem, SentLabel } from "@/lib/analysis/types";
import { classifyTopics } from "@/lib/analysis/sentiment";

export const polygonEnabled = () => !!env.polygon();

/* ── Limitador: 5 llamadas por minuto ─────────────────────────────── */
const calls: number[] = [];
const LIMIT = 5;
const WINDOW = 62_000;
async function slot() {
  for (;;) {
    const now = Date.now();
    while (calls.length && now - calls[0] > WINDOW) calls.shift();
    if (calls.length < LIMIT) {
      calls.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, Math.max(250, WINDOW - (now - calls[0]) + 50)));
  }
}

interface PolyNews {
  status: string;
  results?: Array<{
    id: string;
    title: string;
    description?: string;
    article_url: string;
    published_utc: string;
    image_url?: string;
    tickers?: string[];
    keywords?: string[];
    publisher?: { name?: string };
    insights?: Array<{ ticker: string; sentiment: string; sentiment_reasoning?: string }>;
  }>;
  error?: string;
}

const SCORE: Record<string, number> = { positive: 0.45, neutral: 0, negative: -0.45 };
const LABEL: Record<string, SentLabel> = { positive: "Bullish", neutral: "Neutral", negative: "Bearish" };

function toItems(r: NonNullable<PolyNews["results"]>, symbol?: string): NewsItem[] {
  return r
    .filter((n) => n.title && n.article_url)
    .map((n) => {
      const ins = symbol ? n.insights?.find((i) => i.ticker.toUpperCase() === symbol.toUpperCase()) : n.insights?.[0];
      const key = (ins?.sentiment ?? "").toLowerCase();
      const score = SCORE[key] ?? 0;
      return {
        id: n.id,
        title: n.title,
        summary: ins?.sentiment_reasoning || n.description,
        url: n.article_url,
        source: n.publisher?.name ?? "Polygon",
        publishedAt: new Date(n.published_utc).getTime(),
        image: n.image_url || undefined,
        topics: classifyTopics(`${n.title}. ${n.description ?? ""} ${(n.keywords ?? []).join(" ")}`),
        sentiment: {
          score,
          label: LABEL[key] ?? "Neutral",
          // Sin insight del ticker, la noticia es menos relevante para él
          relevance: ins ? 0.9 : 0.4,
          provider: "polygon" as const,
        },
      };
    });
}

async function get(path: string): Promise<PolyNews> {
  const key = env.polygon();
  if (!key) throw new ProviderError("polygon", 401, "sin POLYGON_API_KEY");
  await slot();
  const d = await fetchJson<PolyNews>("polygon", `https://api.polygon.io/v2/reference/news?${path}&apiKey=${key}`, { timeoutMs: 15000 });
  if (d.error) throw new ProviderError("polygon", 429, d.error);
  return d;
}

/** Noticias de un ticker con sentimiento por empresa. */
export async function polygonNews(symbol: string): Promise<NewsItem[]> {
  return cached(`pg:news:${symbol}`, TTL.news, async () => {
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const d = await get(`ticker=${encodeURIComponent(symbol)}&published_utc.gte=${from}&order=desc&sort=published_utc&limit=50`);
    return toItems(d.results ?? [], symbol);
  });
}

/** Titulares generales del mercado. */
export async function polygonGeneral(): Promise<NewsItem[]> {
  return cached("pg:news:general", TTL.news, async () => {
    const d = await get(`order=desc&sort=published_utc&limit=50`);
    return toItems(d.results ?? []);
  });
}
