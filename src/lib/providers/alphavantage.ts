/**
 * Alpha Vantage NEWS_SENTIMENT — gratis 25 llamadas/día. Devuelve noticias
 * con score de sentimiento POR TICKER (-1..1) y etiqueta Bullish/Bearish.
 * Se cachea 12 h por símbolo para proteger la cuota diaria.
 */
import { reservarCupo, CUPO } from "./cupo";
import { fetchJson, env, ProviderError } from "./http";
import { cached, TTL } from "./cache";
import type { NewsItem, SentLabel } from "@/lib/analysis/types";
import { isNum } from "@/lib/format";

export const alphaEnabled = () => !!env.alphavantage();

interface AVFeed {
  title: string;
  url: string;
  time_published: string; // 20260901T170408
  authors?: string[];
  summary?: string;
  banner_image?: string | null;
  source: string;
  topics?: Array<{ topic: string; relevance_score: string }>;
  overall_sentiment_score: number;
  overall_sentiment_label: string;
  ticker_sentiment?: Array<{ ticker: string; relevance_score: string; ticker_sentiment_score: string; ticker_sentiment_label: string }>;
}
interface AVResp {
  feed?: AVFeed[];
  Information?: string;
  Note?: string;
  "Error Message"?: string;
}

export function labelFromScore(x: number): SentLabel {
  if (x <= -0.35) return "Bearish";
  if (x <= -0.15) return "Somewhat-Bearish";
  if (x < 0.15) return "Neutral";
  if (x < 0.35) return "Somewhat-Bullish";
  return "Bullish";
}

const parseTime = (s: string) => {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?/.exec(s);
  if (!m) return Date.now();
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
};

const TOPIC_ES: Record<string, string> = {
  earnings: "Resultados",
  technology: "Tecnología",
  financial_markets: "Mercados",
  economy_macro: "Macro",
  economy_monetary: "Fed y tasas",
  economy_fiscal: "Fiscal",
  mergers_and_acquisitions: "Fusiones y adquisiciones",
  finance: "Finanzas",
  manufacturing: "Manufactura",
  energy_transportation: "Energía",
  retail_wholesale: "Retail",
  life_sciences: "Salud",
  real_estate: "Inmobiliario",
  ipo: "IPO",
  blockchain: "Cripto",
};

export async function alphaNewsSentiment(symbol: string): Promise<NewsItem[]> {
  const key = env.alphavantage();
  if (!key) throw new ProviderError("alphavantage", 401, "sin ALPHAVANTAGE_API_KEY");
  return cached(`av:news:${symbol}`, TTL.sentimentAV, async () => {
    // 25 al día: solo se llama con cupo propio. Si no hay, falla sin guardar en caché y se reintenta otro día.
    if (!(await reservarCupo("alphavantage"))) throw new ProviderError("alphavantage", 429, `cupo propio del día agotado (tope ${CUPO.alphavantage})`);
    const url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${encodeURIComponent(symbol)}&limit=50&sort=LATEST&apikey=${key}`;
    const d = await fetchJson<AVResp>("alphavantage", url, { timeoutMs: 8000 });
    if (d.Information || d.Note) throw new ProviderError("alphavantage", 429, d.Information || d.Note || "límite");
    if (d["Error Message"]) throw new ProviderError("alphavantage", 400, d["Error Message"]);
    return (d.feed ?? []).map((f, i) => {
      const ts = f.ticker_sentiment?.find((t) => t.ticker.toUpperCase() === symbol.toUpperCase());
      const score = ts && isNum(Number(ts.ticker_sentiment_score)) ? Number(ts.ticker_sentiment_score) : f.overall_sentiment_score;
      const relevance = ts ? Number(ts.relevance_score) : null;
      return {
        id: `av-${i}-${parseTime(f.time_published)}`,
        title: f.title,
        summary: f.summary,
        url: f.url,
        source: f.source,
        publishedAt: parseTime(f.time_published),
        image: f.banner_image || undefined,
        topics: (f.topics ?? []).filter((t) => Number(t.relevance_score) >= 0.5).map((t) => TOPIC_ES[t.topic] ?? t.topic),
        sentiment: { score, label: labelFromScore(score), relevance, provider: "alphavantage" as const },
      };
    });
  });
}
