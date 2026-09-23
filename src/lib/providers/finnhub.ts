/**
 * Finnhub — plan gratis (60 llamadas/min). Endpoints gratuitos usados:
 * quote · profile2 · metric (100+ ratios + series históricas) · peers ·
 * recommendation · insider-sentiment · insider-transactions · company-news ·
 * earnings (sorpresas) · calendar/earnings · search.
 * Los que devuelven 403 (candles, price-target, news-sentiment) NO se usan.
 */
import { fetchJson, env, ProviderError } from "./http";
import { cached, TTL } from "./cache";
import type { Quote, Profile, Metrics, RatioPoint, AnalystView, InsiderView, NewsItem, EarningsSurprise, EarningsCalendar } from "@/lib/analysis/types";
import { isNum } from "@/lib/format";

const BASE = "https://finnhub.io/api/v1";

export const finnhubEnabled = () => !!env.finnhub();

async function fh<T>(path: string, params: Record<string, string | number | undefined> = {}, timeoutMs = 10000): Promise<T> {
  const key = env.finnhub();
  if (!key) throw new ProviderError("finnhub", 401, "sin FINNHUB_API_KEY");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
  const url = `${BASE}${path}?${qs.toString()}`;
  return fetchJson<T>("finnhub", url, { headers: { "X-Finnhub-Token": key }, timeoutMs });
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));

/* ── Quote ─────────────────────────────────────────────────────────── */
interface FQuote { c: number; d: number | null; dp: number | null; h: number; l: number; o: number; pc: number; t: number }

export async function finnhubQuote(symbol: string): Promise<Quote> {
  return cached(`fh:quote:${symbol}`, TTL.quote, async () => {
    const q = await fh<FQuote>("/quote", { symbol });
    if (!isNum(q.c) || q.c === 0) throw new ProviderError("finnhub", 404, "sin cotización");
    return {
      symbol,
      price: q.c,
      change: q.d,
      changePct: q.dp,
      open: q.o,
      high: q.h,
      low: q.l,
      prevClose: q.pc,
      volume: null,
      high52: null,
      low52: null,
      marketCap: null,
      currency: "USD",
      asOf: (q.t || Math.floor(Date.now() / 1000)) * 1000,
      source: "finnhub",
      delayed: false,
    };
  });
}

/* ── Profile ───────────────────────────────────────────────────────── */
interface FProfile {
  name?: string; ticker?: string; exchange?: string; finnhubIndustry?: string; country?: string; ipo?: string;
  marketCapitalization?: number; shareOutstanding?: number; weburl?: string; logo?: string; currency?: string;
}

export async function finnhubProfile(symbol: string): Promise<Profile> {
  return cached(`fh:profile:${symbol}`, TTL.profile, async () => {
    const p = await fh<FProfile>("/stock/profile2", { symbol });
    if (!p.name) throw new ProviderError("finnhub", 404, "sin perfil");
    return {
      symbol,
      name: p.name,
      exchange: p.exchange,
      industry: p.finnhubIndustry,
      country: p.country,
      ipo: p.ipo,
      marketCap: isNum(p.marketCapitalization) ? p.marketCapitalization * 1e6 : null,
      sharesOutstanding: isNum(p.shareOutstanding) ? p.shareOutstanding * 1e6 : null,
      website: p.weburl,
      logo: p.logo,
      source: "finnhub",
    };
  });
}

/* ── Basic financials (metric + series) ────────────────────────────── */
interface FMetric {
  metric: Record<string, number | null | undefined>;
  series?: { annual?: Record<string, Array<{ period: string; v: number }>>; quarterly?: Record<string, Array<{ period: string; v: number }>> };
}

export interface FinnhubMetrics extends Metrics {
  raw: Record<string, number | null | undefined>;
}

const num = (v: unknown): number | null => (isNum(v) ? v : null);

export async function finnhubMetrics(symbol: string): Promise<FinnhubMetrics> {
  return cached(`fh:metric:${symbol}`, TTL.metrics, async () => {
    const d = await fh<FMetric>("/stock/metric", { symbol, metric: "all" });
    const m = d.metric ?? {};
    const A = d.series?.annual ?? {};
    const rp = (k: string): RatioPoint[] => (A[k] ?? []).filter((x) => isNum(x.v)).map((x) => ({ period: x.period, v: x.v })).sort((a, b) => a.period.localeCompare(b.period));
    const pe = num(m.peTTM) ?? num(m.peBasicExclExtraTTM) ?? num(m.peExclExtraTTM) ?? num(m.peAnnual);
    const epsGrowth = num(m.epsGrowth5Y) ?? num(m.epsGrowthTTMYoy) ?? num(m.epsGrowth3Y);
    const peg = isNum(pe) && isNum(epsGrowth) && epsGrowth > 0 ? pe / epsGrowth : null;
    const mcap = isNum(m.marketCapitalization) ? m.marketCapitalization * 1e6 : null;
    const ev = isNum(m.enterpriseValue) ? m.enterpriseValue * 1e6 : null;
    const roic = num(m.roiTTM) ?? num(m.roi5Y) ?? num(m.roiAnnual);
    return {
      pe,
      forwardPe: null, // Finnhub free no trae forward P/E; se toma de Yahoo
      peg,
      ps: num(m.psTTM) ?? num(m.psAnnual),
      pb: num(m.pbQuarterly) ?? num(m.pbAnnual),
      evEbitda: null,
      pFcf: num(m.pfcfShareTTM) ?? num(m.pfcfShareAnnual),
      dividendYield: num(m.currentDividendYieldTTM) ?? num(m.dividendYieldIndicatedAnnual),
      payoutRatio: num(m.payoutRatioTTM) ?? num(m.payoutRatioAnnual),
      beta: num(m.beta),
      roe: num(m.roeTTM) ?? num(m.roeRfy),
      roic,
      roa: num(m.roaTTM) ?? num(m.roaRfy),
      grossMargin: num(m.grossMarginTTM) ?? num(m.grossMarginAnnual),
      operatingMargin: num(m.operatingMarginTTM) ?? num(m.operatingMarginAnnual),
      netMargin: num(m.netProfitMarginTTM) ?? num(m.netProfitMarginAnnual),
      revenueGrowthTTM: num(m.revenueGrowthTTMYoy) ?? num(m.revenueGrowthQuarterlyYoy),
      revenueGrowth5Y: num(m.revenueGrowth5Y) ?? num(m.revenueGrowth3Y),
      epsGrowthTTM: num(m.epsGrowthTTMYoy),
      epsGrowth5Y: num(m.epsGrowth5Y) ?? num(m.epsGrowth3Y),
      debtToEquity: num(m["totalDebt/totalEquityQuarterly"]) ?? num(m["totalDebt/totalEquityAnnual"]),
      currentRatio: num(m.currentRatioQuarterly) ?? num(m.currentRatioAnnual),
      interestCoverage: num(m.netInterestCoverageTTM) ?? num(m.netInterestCoverageAnnual),
      epsTTM: num(m.epsTTM) ?? num(m.epsExclExtraItemsTTM) ?? num(m.epsAnnual),
      epsForward: null,
      bvps: num(m.bookValuePerShareQuarterly) ?? num(m.bookValuePerShareAnnual),
      marketCap: mcap,
      enterpriseValue: ev,
      netDebt: isNum(m.netDebtInterim) ? m.netDebtInterim * 1e6 : isNum(m.netDebtAnnual) ? m.netDebtAnnual * 1e6 : null,
      high52: num(m["52WeekHigh"]),
      low52: num(m["52WeekLow"]),
      analystTarget: null,
      shortPctFloat: null,
      growthEstimate: null,
      insidersPct: null,
      institutionsPct: null,
      history: {
        pe: rp("pe"),
        ps: rp("ps"),
        pb: rp("pb"),
        roe: rp("roe"),
        roic: rp("roic"),
        grossMargin: rp("grossMargin"),
        netMargin: rp("netMargin"),
        forwardPe: [],
        peg: [],
        evEbitda: [],
      },
      sources: ["finnhub"],
      raw: m,
    };
  });
}

/* ── Peers ─────────────────────────────────────────────────────────── */
export async function finnhubPeers(symbol: string): Promise<string[]> {
  return cached(`fh:peers:${symbol}`, TTL.peers, async () => {
    const p = await fh<string[]>("/stock/peers", { symbol, grouping: "subIndustry" });
    return (Array.isArray(p) ? p : []).filter((s) => s && s !== symbol && !s.includes(".")).slice(0, 8);
  });
}

/* ── Analistas ─────────────────────────────────────────────────────── */
interface FRec { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }

export async function finnhubRecommendation(symbol: string): Promise<AnalystView | null> {
  return cached(`fh:rec:${symbol}`, TTL.calendar, async () => {
    const r = await fh<FRec[]>("/stock/recommendation", { symbol });
    const latest = r?.[0];
    if (!latest) return null;
    const total = latest.strongBuy + latest.buy + latest.hold + latest.sell + latest.strongSell;
    if (!total) return null;
    const score = (latest.strongBuy * 1 + latest.buy * 0.5 - latest.sell * 0.5 - latest.strongSell * 1) / total;
    const consensus = score > 0.55 ? "Compra fuerte" : score > 0.3 ? "Compra" : score > -0.1 ? "Mantener" : score > -0.4 ? "Venta" : "Venta fuerte";
    return { ...latest, total, consensus, score };
  });
}

/* ── Insiders ──────────────────────────────────────────────────────── */
interface FInsiderSent { data: Array<{ symbol: string; year: number; month: number; change: number; mspr: number }> }
interface FInsiderTx { data: Array<{ name: string; share: number; change: number; transactionDate: string; transactionCode: string; transactionPrice: number }> }

export async function finnhubInsiders(symbol: string): Promise<InsiderView | null> {
  return cached(`fh:insider:${symbol}`, TTL.calendar, async () => {
    const [sent, tx] = await Promise.all([
      fh<FInsiderSent>("/stock/insider-sentiment", { symbol, from: daysAgo(120), to: iso(new Date()) }).catch(() => null),
      fh<FInsiderTx>("/stock/insider-transactions", { symbol, from: daysAgo(180), to: iso(new Date()) }).catch(() => null),
    ]);
    const months = sent?.data ?? [];
    const last3 = months.slice(-3);
    const mspr = last3.length ? last3.reduce((a, b) => a + (b.mspr ?? 0), 0) / last3.length : null;
    const netChange = last3.length ? last3.reduce((a, b) => a + (b.change ?? 0), 0) : null;
    const rows = tx?.data ?? [];
    // Código P = compra en mercado abierto; S = venta. Ignoramos M/A/F (ejercicios, impuestos).
    const buys = rows.filter((r) => r.transactionCode === "P").length;
    const sells = rows.filter((r) => r.transactionCode === "S").length;
    if (!months.length && !rows.length) return null;
    const note = isNum(mspr)
      ? mspr > 20 ? "Insiders comprando netamente (señal positiva)" : mspr < -20 ? "Insiders vendiendo netamente (vigilar, suele ser diversificación)" : "Actividad de insiders neutral"
      : "Sin datos de sentimiento insider";
    return { mspr, netChange, buys, sells, note };
  });
}

/* ── Noticias ──────────────────────────────────────────────────────── */
interface FNews { id: number; headline: string; summary: string; url: string; source: string; datetime: number; image?: string; category?: string; related?: string }

export async function finnhubNews(symbol: string): Promise<NewsItem[]> {
  return cached(`fh:news:${symbol}`, TTL.news, async () => {
    const n = await fh<FNews[]>("/company-news", { symbol, from: daysAgo(30), to: iso(new Date()) });
    const seen = new Set<string>();
    return (n ?? [])
      .filter((x) => x.headline && x.url && !seen.has(x.headline) && seen.add(x.headline))
      .slice(0, 60)
      .map((x) => ({
        id: String(x.id),
        title: x.headline,
        summary: x.summary,
        url: x.url,
        source: x.source,
        publishedAt: x.datetime * 1000,
        image: x.image || undefined,
        topics: [],
        sentiment: { score: 0, label: "Neutral" as const, relevance: null, provider: "finnhub" as const },
      }));
  });
}

/* ── Earnings ──────────────────────────────────────────────────────── */
interface FEarn { period: string; actual: number | null; estimate: number | null; surprisePercent: number | null }

export async function finnhubEarnings(symbol: string): Promise<EarningsSurprise[]> {
  return cached(`fh:earn:${symbol}`, TTL.calendar, async () => {
    const e = await fh<FEarn[]>("/stock/earnings", { symbol, limit: 8 });
    return (e ?? []).map((x) => ({ period: x.period, actual: x.actual, estimate: x.estimate, surprisePct: x.surprisePercent }));
  });
}

interface FCal { earningsCalendar: Array<{ date: string; hour?: string; epsEstimate: number | null; revenueEstimate: number | null; symbol: string }> }

export async function finnhubEarningsCalendar(symbol: string): Promise<EarningsCalendar | null> {
  return cached(`fh:cal:${symbol}`, TTL.calendar, async () => {
    const c = await fh<FCal>("/calendar/earnings", { symbol, from: iso(new Date()), to: daysAgo(-120) });
    const next = (c.earningsCalendar ?? []).filter((x) => x.symbol === symbol).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!next) return { nextDate: null, daysUntil: null, epsEstimate: null, revenueEstimate: null };
    const daysUntil = Math.round((new Date(next.date).getTime() - Date.now()) / 86400000);
    return { nextDate: next.date, daysUntil, hour: next.hour, epsEstimate: next.epsEstimate, revenueEstimate: next.revenueEstimate };
  });
}

/* ── Búsqueda ──────────────────────────────────────────────────────── */
interface FSearch { result: Array<{ symbol: string; description: string; type: string; displaySymbol: string }> }

export async function finnhubSearch(q: string) {
  return cached(`fh:search:${q.toLowerCase()}`, TTL.search, async () => {
    const r = await fh<FSearch>("/search", { q, exchange: "US" });
    return (r.result ?? [])
      .filter((x) => x.type === "Common Stock" || x.type === "ETP")
      .slice(0, 10)
      .map((x) => ({ symbol: x.symbol, name: x.description, exchange: "US", type: x.type === "ETP" ? "ETF" : "EQUITY" }));
  });
}

/* ── Noticias generales de mercado ─────────────────────────────────── */
export async function finnhubGeneralNews(): Promise<NewsItem[]> {
  return cached("fh:news:general", TTL.news, async () => {
    const n = await fh<FNews[]>("/news", { category: "general" });
    const seen = new Set<string>();
    return (n ?? [])
      .filter((x) => x.headline && x.url && !seen.has(x.headline) && seen.add(x.headline))
      .slice(0, 60)
      .map((x) => ({ id: String(x.id), title: x.headline, summary: x.summary, url: x.url, source: x.source, publishedAt: x.datetime * 1000, image: x.image || undefined, topics: [], sentiment: { score: 0, label: "Neutral" as const, relevance: null, provider: "finnhub" as const } }));
  });
}
