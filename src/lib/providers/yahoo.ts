/**
 * Yahoo Finance (endpoints públicos sin llave). Cotizaciones con ~15 min de
 * retraso fuera de horario, histórico de precios (10 años), fundamentales
 * anuales (4 años), múltiplos trailing y —con sesión cookie+crumb— el
 * quoteSummary: analistas, fecha de earnings, insiders, estimaciones de
 * crecimiento, interés en corto. Es la red de seguridad cuando no hay llaves.
 *
 * Yahoo devuelve 429 ante ráfagas sin cookie: usamos una sesión (cookie A3 +
 * crumb), concurrencia limitada y reintentos con espera.
 */
import { fetchJson, recordHealth, ProviderError } from "./http";
import { cached, TTL } from "./cache";
import type { Quote, PriceHistory, PricePoint, Profile, RatioPoint, NewsItem, AnnualRow, QuarterRow, N } from "@/lib/analysis/types";
import { isNum } from "@/lib/format";

const UA = "Mozilla/5.0";
const Q1 = "https://query1.finance.yahoo.com";
const Q2 = "https://query2.finance.yahoo.com";
const enc = (s: string) => encodeURIComponent(s);

/* ── Sesión (cookie + crumb) ─────────────────────────────────────── */
type Session = { cookie: string; crumb: string; at: number } | null;
let session: Session = null;
let sessionPromise: Promise<Session> | null = null;

async function getSession(force = false) {
  if (!force && session && Date.now() - session.at < 6 * 3600 * 1000) return session;
  if (sessionPromise && !force) return sessionPromise;
  sessionPromise = (async () => {
    try {
      const r = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", cache: "no-store" });
      const setCookie = r.headers.getSetCookie?.() ?? [];
      const cookie = setCookie.map((c) => c.split(";")[0]).filter((c) => /^(A3|A1|A1S|B)=/.test(c)).join("; ");
      let crumb = "";
      if (cookie) {
        const c = await fetch(`${Q1}/v1/test/getcrumb`, { headers: { "User-Agent": UA, Cookie: cookie }, cache: "no-store" });
        if (c.ok) crumb = (await c.text()).trim();
      }
      session = { cookie, crumb: /^[\w./-]+$/.test(crumb) ? crumb : "", at: Date.now() };
    } catch {
      session = { cookie: "", crumb: "", at: Date.now() - 5 * 3600 * 1000 }; // reintentar pronto
    } finally {
      sessionPromise = null;
    }
    return session;
  })();
  return sessionPromise;
}

/* ── Limitador de concurrencia + reintentos ──────────────────────── */
let active = 0;
const queue: Array<() => void> = [];
const MAX_CONCURRENT = 3;
const acquire = () =>
  new Promise<void>((res) => {
    if (active < MAX_CONCURRENT) {
      active++;
      res();
    } else queue.push(() => {
      active++;
      res();
    });
  });
const release = () => {
  active--;
  queue.shift()?.();
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function yfetch<T>(url: string, opts: { crumb?: boolean } = {}): Promise<T> {
  await acquire();
  try {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 4; attempt++) {
      const s = await getSession(attempt > 1);
      const u = opts.crumb && s?.crumb ? `${url}${url.includes("?") ? "&" : "?"}crumb=${enc(s.crumb)}` : url;
      try {
        return await fetchJson<T>("yahoo", u, { headers: { "User-Agent": UA, Accept: "application/json", ...(s?.cookie ? { Cookie: s.cookie } : {}) } });
      } catch (e) {
        lastErr = e;
        const st = e instanceof ProviderError ? e.status : 0;
        if (st === 429 || st === 401 || st === 403 || st === 0) {
          await sleep(700 * (attempt + 1) + Math.random() * 500);
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  } finally {
    release();
  }
}

/* ── Búsqueda ─────────────────────────────────────────────────────── */
export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  sector?: string;
  industry?: string;
}

interface YSearch {
  quotes?: Array<{ symbol: string; shortname?: string; longname?: string; exchDisp?: string; quoteType?: string; sector?: string; industry?: string; isYahooFinance?: boolean }>;
  news?: Array<{ uuid: string; title: string; publisher: string; link: string; providerPublishTime: number; thumbnail?: { resolutions?: Array<{ url: string; width: number }> } }>;
}

export async function yahooSearch(q: string): Promise<SearchHit[]> {
  return cached(`yh:search:${q.toLowerCase()}`, TTL.search, async () => {
    const d = await yfetch<YSearch>(`${Q1}/v1/finance/search?q=${enc(q)}&quotesCount=10&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query`);
    return (d.quotes ?? [])
      .filter((x) => x.isYahooFinance !== false && x.symbol && (x.quoteType === "EQUITY" || x.quoteType === "ETF"))
      .map((x) => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol, exchange: x.exchDisp || "", type: x.quoteType || "EQUITY", sector: x.sector, industry: x.industry }));
  });
}

export async function yahooNews(symbol: string): Promise<NewsItem[]> {
  return cached(`yh:news:${symbol}`, TTL.news, async () => {
    const d = await yfetch<YSearch>(`${Q1}/v1/finance/search?q=${enc(symbol)}&quotesCount=0&newsCount=15`);
    return (d.news ?? []).map((n) => ({
      id: n.uuid,
      title: n.title,
      url: n.link,
      source: n.publisher,
      publishedAt: n.providerPublishTime * 1000,
      image: n.thumbnail?.resolutions?.[0]?.url,
      topics: [],
      sentiment: { score: 0, label: "Neutral" as const, relevance: null, provider: "yahoo" as const },
    }));
  });
}

/* ── Chart: cotización + histórico ────────────────────────────────── */
interface YChart {
  chart: {
    result: Array<{
      meta: {
        currency: string; symbol: string; exchangeName: string; fullExchangeName?: string; instrumentType: string; regularMarketPrice: number;
        regularMarketChangePercent?: number; chartPreviousClose?: number; previousClose?: number; regularMarketDayHigh?: number; regularMarketDayLow?: number;
        regularMarketVolume?: number; regularMarketTime?: number; fiftyTwoWeekHigh?: number; fiftyTwoWeekLow?: number; longName?: string; shortName?: string;
      };
      timestamp?: number[];
      events?: { dividends?: Record<string, { amount: number; date: number }>; splits?: Record<string, { date: number; numerator: number; denominator: number; splitRatio: string }> };
      indicators: { quote: Array<{ close?: Array<number | null>; open?: Array<number | null> }> };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

async function chart(symbol: string, range: string, interval: string) {
  const d = await yfetch<YChart>(`${Q1}/v8/finance/chart/${enc(symbol)}?interval=${interval}&range=${range}&includePrePost=false&events=div%2Csplit`);
  const r = d.chart.result?.[0];
  if (!r) throw new ProviderError("yahoo", 404, d.chart.error?.description || "sin datos");
  return r;
}

function toPoints(r: Awaited<ReturnType<typeof chart>>): PricePoint[] {
  const ts = r.timestamp ?? [];
  const closes = r.indicators.quote[0]?.close ?? [];
  const out: PricePoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (isNum(c)) out.push({ t: ts[i] * 1000, c });
  }
  return out;
}

export async function yahooQuote(symbol: string): Promise<Quote> {
  return cached(`yh:quote:${symbol}`, TTL.quote, async () => {
    const r = await chart(symbol, "5d", "1d");
    const m = r.meta;
    const prev = m.chartPreviousClose ?? m.previousClose ?? null;
    const price = m.regularMarketPrice;
    const change = isNum(prev) ? price - prev : null;
    const changePct = isNum(m.regularMarketChangePercent) ? m.regularMarketChangePercent : isNum(prev) && prev !== 0 ? ((price - prev) / prev) * 100 : null;
    const opens = r.indicators.quote[0]?.open ?? [];
    return {
      symbol: m.symbol,
      name: m.longName || m.shortName,
      price,
      change,
      changePct,
      open: opens.length ? (opens[opens.length - 1] ?? null) : null,
      high: m.regularMarketDayHigh ?? null,
      low: m.regularMarketDayLow ?? null,
      prevClose: prev,
      volume: m.regularMarketVolume ?? null,
      high52: m.fiftyTwoWeekHigh ?? null,
      low52: m.fiftyTwoWeekLow ?? null,
      marketCap: null,
      currency: m.currency || "USD",
      exchange: m.fullExchangeName || m.exchangeName,
      quoteType: m.instrumentType,
      asOf: (m.regularMarketTime ?? Math.floor(Date.now() / 1000)) * 1000,
      source: "yahoo",
      delayed: true,
    };
  });
}

/**
 * Serie de cierres para un rango e intervalo de Yahoo (`1d`/`5m`, `1y`/`1d`, `5y`/`1wk`…), con
 * el cierre anterior al rango: en intradía es la base correcta para que el % del día coincida
 * con la variación que publica el mercado. La última barra es la del precio actual.
 */
export async function yahooSerie(
  symbol: string,
  range: string,
  interval: string,
  ttlMs: number,
): Promise<{ points: PricePoint[]; prevClose: number | null; sesiones: number[] }> {
  return cached(`yh:serie2:${symbol}:${range}:${interval}`, ttlMs, async () => {
    const r = await chart(symbol, range, interval);
    return {
      points: toPoints(r),
      prevClose: r.meta.chartPreviousClose ?? r.meta.previousClose ?? null,
      // Todas las barras, también las que llegan sin cierre: en diario Yahoo deja vacía por
      // horas la de la sesión anterior, y hay que saber qué día era para completarla.
      sesiones: (r.timestamp ?? []).map((t) => t * 1000),
    };
  });
}

export async function yahooHistory(symbol: string): Promise<PriceHistory> {
  return cached(`yh:hist2:${symbol}`, TTL.history, async () => {
    const [d, w, m] = await Promise.all([chart(symbol, "2y", "1d"), chart(symbol, "5y", "1wk"), chart(symbol, "10y", "1mo")]);
    const dividends = Object.values(m.events?.dividends ?? {})
      .map((x) => ({ t: x.date * 1000, amount: x.amount }))
      .sort((a, b) => a.t - b.t);
    const splits = Object.values(m.events?.splits ?? {})
      .map((x) => ({ t: x.date * 1000, ratio: x.splitRatio }))
      .sort((a, b) => a.t - b.t);
    return { symbol, daily: toPoints(d), weekly: toPoints(w), monthly: toPoints(m), dividends, splits, source: "yahoo" };
  });
}

export async function yahooProfileFromSearch(symbol: string): Promise<Partial<Profile>> {
  const hits = await yahooSearch(symbol).catch(() => [] as SearchHit[]);
  const h = hits.find((x) => x.symbol.toUpperCase() === symbol.toUpperCase()) ?? hits[0];
  return h ? { name: h.name, exchange: h.exchange, sector: h.sector, industry: h.industry, quoteType: h.type } : {};
}

/* ── quoteSummary (requiere crumb) ───────────────────────────────── */
type Raw = { raw?: number; fmt?: string } | number | null | undefined;
const rv = (x: Raw): N => (typeof x === "number" ? x : x && isNum(x.raw) ? x.raw : null);

interface YSummary {
  quoteSummary: {
    result: Array<{
      assetProfile?: { sector?: string; industry?: string; longBusinessSummary?: string; fullTimeEmployees?: number; website?: string; country?: string };
      summaryDetail?: { marketCap?: Raw; trailingPE?: Raw; forwardPE?: Raw; dividendYield?: Raw; beta?: Raw; fiftyTwoWeekHigh?: Raw; fiftyTwoWeekLow?: Raw; payoutRatio?: Raw };
      defaultKeyStatistics?: { forwardPE?: Raw; pegRatio?: Raw; beta?: Raw; sharesOutstanding?: Raw; heldPercentInsiders?: Raw; heldPercentInstitutions?: Raw; shortPercentOfFloat?: Raw; enterpriseValue?: Raw; enterpriseToEbitda?: Raw; priceToBook?: Raw; bookValue?: Raw; trailingEps?: Raw; forwardEps?: Raw; earningsQuarterlyGrowth?: Raw };
      financialData?: { financialCurrency?: string; targetMeanPrice?: Raw; targetHighPrice?: Raw; targetLowPrice?: Raw; recommendationKey?: string; recommendationMean?: Raw; numberOfAnalystOpinions?: Raw; returnOnEquity?: Raw; returnOnAssets?: Raw; grossMargins?: Raw; operatingMargins?: Raw; profitMargins?: Raw; revenueGrowth?: Raw; earningsGrowth?: Raw; totalCash?: Raw; totalDebt?: Raw; freeCashflow?: Raw; operatingCashflow?: Raw; currentRatio?: Raw; debtToEquity?: Raw; totalRevenue?: Raw; ebitda?: Raw };
      recommendationTrend?: { trend?: Array<{ period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }> };
      calendarEvents?: { earnings?: { earningsDate?: Array<Raw>; earningsAverage?: Raw; revenueAverage?: Raw } };
      earningsTrend?: { trend?: Array<{ period: string; growth?: Raw; earningsEstimate?: { avg?: Raw; low?: Raw; high?: Raw; numberOfAnalysts?: Raw; growth?: Raw }; revenueEstimate?: { avg?: Raw; low?: Raw; high?: Raw; numberOfAnalysts?: Raw; growth?: Raw } }> };
      earningsHistory?: { history?: Array<{ quarter?: Raw; epsActual?: Raw; epsEstimate?: Raw; surprisePercent?: Raw }> };
      netSharePurchaseActivity?: { buyInfoCount?: Raw; sellInfoCount?: Raw; netInfoCount?: Raw; netPercentInsiderShares?: Raw; buyInfoShares?: Raw; sellInfoShares?: Raw };
      price?: { marketCap?: Raw; longName?: string; shortName?: string; exchangeName?: string; quoteType?: string };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

export interface YahooSummary {
  financialCurrency?: string;
  sector?: string;
  industry?: string;
  description?: string;
  employees: N;
  website?: string;
  country?: string;
  marketCap: N;
  sharesOutstanding: N;
  pe: N;
  forwardPe: N;
  peg: N;
  pb: N;
  evEbitda: N;
  beta: N;
  dividendYield: N; // %
  payoutRatio: N; // %
  epsTTM: N;
  epsForward: N;
  bvps: N;
  roe: N; // %
  roa: N;
  grossMargin: N;
  operatingMargin: N;
  netMargin: N;
  revenueGrowth: N; // % yoy trimestral
  earningsGrowth: N;
  totalCash: N;
  totalDebt: N;
  fcf: N;
  currentRatio: N;
  debtToEquity: N; // ratio
  analyst: { targetMean: N; targetHigh: N; targetLow: N; key?: string; count: N; trend: { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number } | null };
  nextEarnings: { date: string | null; epsEstimate: N; revenueEstimate: N };
  growth: { nextYear: N; next5y: N; currentYear: N }; // % estimados
  /** Consenso de analistas por año fiscal: 0 = año en curso, 1 = próximo. Crecimientos en %. */
  estimates: { eps0: N; eps1: N; rev0: N; rev1: N; epsG0: N; epsG1: N; revG0: N; revG1: N; rango?: Array<{ rev: N; revLow: N; revHigh: N; revN: N; eps: N; epsLow: N; epsHigh: N; epsN: N }> };
  surprises: Array<{ period: string; actual: N; estimate: N; surprisePct: N }>;
  insiders: { pct: N; institutionsPct: N; buys: N; sells: N; netPct: N };
  shortPctFloat: N; // %
}

const MODULES = ["assetProfile", "summaryDetail", "defaultKeyStatistics", "financialData", "recommendationTrend", "calendarEvents", "earningsTrend", "earningsHistory", "netSharePurchaseActivity", "price"].join(",");
const pctOf = (x: Raw): N => (isNum(rv(x)) ? (rv(x) as number) * 100 : null);

export async function yahooSummary(symbol: string): Promise<YahooSummary> {
  return cached(`yh:summary2:${symbol}`, TTL.metrics, async () => {
    const d = await yfetch<YSummary>(`${Q2}/v10/finance/quoteSummary/${enc(symbol)}?modules=${MODULES}`, { crumb: true });
    const r = d.quoteSummary.result?.[0];
    if (!r) throw new ProviderError("yahoo", 404, d.quoteSummary.error?.description || "sin quoteSummary");
    const sd = r.summaryDetail ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const fd = r.financialData ?? {};
    const ap = r.assetProfile ?? {};
    const trend = r.recommendationTrend?.trend?.find((t) => t.period === "0m") ?? r.recommendationTrend?.trend?.[0] ?? null;
    const ed = r.calendarEvents?.earnings?.earningsDate?.map(rv).find(isNum);
    const et = r.earningsTrend?.trend ?? [];
    const g = (p: string) => pctOf(et.find((t) => t.period === p)?.growth);
    const nspa = r.netSharePurchaseActivity ?? {};
    return {
      financialCurrency: fd.financialCurrency,
      sector: ap.sector,
      industry: ap.industry,
      description: ap.longBusinessSummary,
      employees: ap.fullTimeEmployees ?? null,
      website: ap.website,
      country: ap.country,
      marketCap: rv(sd.marketCap) ?? rv(r.price?.marketCap),
      sharesOutstanding: rv(ks.sharesOutstanding),
      pe: rv(sd.trailingPE),
      forwardPe: rv(ks.forwardPE) ?? rv(sd.forwardPE),
      peg: rv(ks.pegRatio),
      pb: rv(ks.priceToBook),
      evEbitda: rv(ks.enterpriseToEbitda),
      beta: rv(ks.beta) ?? rv(sd.beta),
      dividendYield: pctOf(sd.dividendYield),
      payoutRatio: pctOf(sd.payoutRatio),
      epsTTM: rv(ks.trailingEps),
      epsForward: rv(ks.forwardEps),
      bvps: rv(ks.bookValue),
      roe: pctOf(fd.returnOnEquity),
      roa: pctOf(fd.returnOnAssets),
      grossMargin: pctOf(fd.grossMargins),
      operatingMargin: pctOf(fd.operatingMargins),
      netMargin: pctOf(fd.profitMargins),
      revenueGrowth: pctOf(fd.revenueGrowth),
      earningsGrowth: pctOf(fd.earningsGrowth),
      totalCash: rv(fd.totalCash),
      totalDebt: rv(fd.totalDebt),
      fcf: rv(fd.freeCashflow),
      currentRatio: rv(fd.currentRatio),
      debtToEquity: isNum(rv(fd.debtToEquity)) ? (rv(fd.debtToEquity) as number) / 100 : null,
      analyst: { targetMean: rv(fd.targetMeanPrice), targetHigh: rv(fd.targetHighPrice), targetLow: rv(fd.targetLowPrice), key: fd.recommendationKey, count: rv(fd.numberOfAnalystOpinions), trend },
      nextEarnings: { date: isNum(ed) ? new Date(ed * 1000).toISOString().slice(0, 10) : null, epsEstimate: rv(r.calendarEvents?.earnings?.earningsAverage), revenueEstimate: rv(r.calendarEvents?.earnings?.revenueAverage) },
      growth: { nextYear: g("+1y"), next5y: g("+5y"), currentYear: g("0y") },
      estimates: (() => {
        const t0 = et.find((t) => t.period === "0y");
        const t1 = et.find((t) => t.period === "+1y");
        return {
          eps0: rv(t0?.earningsEstimate?.avg), eps1: rv(t1?.earningsEstimate?.avg),
          rev0: rv(t0?.revenueEstimate?.avg), rev1: rv(t1?.revenueEstimate?.avg),
          epsG0: pctOf(t0?.earningsEstimate?.growth), epsG1: pctOf(t1?.earningsEstimate?.growth),
          revG0: pctOf(t0?.revenueEstimate?.growth), revG1: pctOf(t1?.revenueEstimate?.growth),
          // Rango y número de analistas de este año (0y) y el próximo (+1y), para la tabla de consenso
          rango: [t0, t1].map((t) => ({
            rev: rv(t?.revenueEstimate?.avg), revLow: rv(t?.revenueEstimate?.low), revHigh: rv(t?.revenueEstimate?.high), revN: rv(t?.revenueEstimate?.numberOfAnalysts),
            eps: rv(t?.earningsEstimate?.avg), epsLow: rv(t?.earningsEstimate?.low), epsHigh: rv(t?.earningsEstimate?.high), epsN: rv(t?.earningsEstimate?.numberOfAnalysts),
          })),
        };
      })(),
      surprises: (r.earningsHistory?.history ?? []).map((h) => ({ period: isNum(rv(h.quarter)) ? new Date((rv(h.quarter) as number) * 1000).toISOString().slice(0, 10) : "", actual: rv(h.epsActual), estimate: rv(h.epsEstimate), surprisePct: pctOf(h.surprisePercent) })),
      insiders: { pct: pctOf(ks.heldPercentInsiders), institutionsPct: pctOf(ks.heldPercentInstitutions), buys: rv(nspa.buyInfoCount), sells: rv(nspa.sellInfoCount), netPct: pctOf(nspa.netPercentInsiderShares) },
      shortPctFloat: pctOf(ks.shortPercentOfFloat),
    };
  });
}

/* ── Fundamentales (timeseries) ───────────────────────────────────── */
const ANNUAL_TYPES = [
  "annualTotalRevenue", "annualGrossProfit", "annualOperatingIncome", "annualNetIncome", "annualDilutedEPS", "annualDilutedAverageShares",
  "annualOperatingCashFlow", "annualCapitalExpenditure", "annualFreeCashFlow", "annualTotalDebt", "annualCashCashEquivalentsAndShortTermInvestments",
  "annualCashAndCashEquivalents", "annualStockholdersEquity", "annualTotalAssets", "annualCurrentAssets", "annualCurrentLiabilities", "annualInterestExpense",
  "annualTaxProvision", "annualPretaxIncome", "annualResearchAndDevelopment", "annualStockBasedCompensation", "annualRepurchaseOfCapitalStock",
  "annualCashDividendsPaid", "annualRetainedEarnings",
];
const QUARTER_TYPES = ["quarterlyTotalRevenue", "quarterlyNetIncome", "quarterlyDilutedEPS", "quarterlyFreeCashFlow"];
const TRAILING_TYPES = ["trailingPeRatio", "trailingForwardPeRatio", "trailingPegRatio", "trailingPsRatio", "trailingPbRatio", "trailingEnterprisesValueEBITDARatio", "trailingEnterpriseValue", "trailingMarketCap"];

interface YTs {
  timeseries: { result: Array<{ meta: { symbol: string[]; type: string[] } } & Record<string, unknown>> };
}
type Series = Record<string, Array<{ date: string; v: number }>>;

async function timeseries(symbol: string, types: string[]): Promise<Series> {
  const p1 = Math.floor(Date.now() / 1000) - 12 * 365 * 86400;
  const p2 = Math.floor(Date.now() / 1000) + 86400;
  const d = await yfetch<YTs>(`${Q1}/ws/fundamentals-timeseries/v1/finance/timeseries/${enc(symbol)}?type=${types.join(",")}&period1=${p1}&period2=${p2}&merge=false&padTimeSeries=false`);
  const out: Series = {};
  for (const r of d.timeseries.result ?? []) {
    const t = r.meta.type[0];
    const arr = r[t] as Array<{ asOfDate: string; reportedValue: { raw: number } }> | undefined;
    if (!Array.isArray(arr)) continue;
    out[t] = arr.filter((x) => x && x.reportedValue && isNum(x.reportedValue.raw)).map((x) => ({ date: x.asOfDate, v: x.reportedValue.raw }));
  }
  return out;
}

export interface YahooFundamentals {
  annual: AnnualRow[];
  quarterly: QuarterRow[];
  trailing: { pe: RatioPoint[]; forwardPe: RatioPoint[]; peg: RatioPoint[]; ps: RatioPoint[]; pb: RatioPoint[]; evEbitda: RatioPoint[]; ev: RatioPoint[]; marketCap: RatioPoint[] };
}

export async function yahooFundamentals(symbol: string): Promise<YahooFundamentals> {
  return cached(`yh:fund:${symbol}`, TTL.history, async () => {
    const [a, q, t] = await Promise.all([timeseries(symbol, ANNUAL_TYPES), timeseries(symbol, QUARTER_TYPES), timeseries(symbol, TRAILING_TYPES)]);
    const byDate = new Map<string, Partial<AnnualRow>>();
    const put = (type: string, field: keyof AnnualRow, sign = 1) => {
      for (const p of a[type] ?? []) {
        const row = byDate.get(p.date) ?? {};
        (row as Record<string, unknown>)[field] = p.v * sign;
        byDate.set(p.date, row);
      }
    };
    put("annualTotalRevenue", "revenue");
    put("annualGrossProfit", "grossProfit");
    put("annualOperatingIncome", "operatingIncome");
    put("annualNetIncome", "netIncome");
    put("annualDilutedEPS", "epsDiluted");
    put("annualDilutedAverageShares", "sharesDiluted");
    put("annualOperatingCashFlow", "ocf");
    put("annualCapitalExpenditure", "capex", -1);
    put("annualFreeCashFlow", "fcf");
    put("annualTotalDebt", "totalDebt");
    put("annualCashCashEquivalentsAndShortTermInvestments", "cash");
    put("annualStockholdersEquity", "equity");
    put("annualTotalAssets", "totalAssets");
    put("annualCurrentAssets", "currentAssets");
    put("annualCurrentLiabilities", "currentLiabilities");
    put("annualInterestExpense", "interestExpense");
    put("annualTaxProvision", "taxExpense");
    put("annualPretaxIncome", "pretaxIncome");
    put("annualResearchAndDevelopment", "rnd");
    put("annualStockBasedCompensation", "sbc");
    put("annualRepurchaseOfCapitalStock", "buybacks", -1);
    put("annualCashDividendsPaid", "dividends", -1);
    put("annualRetainedEarnings", "retainedEarnings");
    for (const p of a["annualCashAndCashEquivalents"] ?? []) {
      const row = byDate.get(p.date) ?? {};
      if (!isNum(row.cash)) row.cash = p.v;
      byDate.set(p.date, row);
    }
    const annual: AnnualRow[] = [...byDate.entries()]
      .map(([end, r]) => ({
        fy: Number(end.slice(0, 4)), end,
        revenue: r.revenue ?? null, grossProfit: r.grossProfit ?? null, operatingIncome: r.operatingIncome ?? null, netIncome: r.netIncome ?? null,
        epsDiluted: r.epsDiluted ?? null, sharesDiluted: r.sharesDiluted ?? null, ocf: r.ocf ?? null, capex: r.capex ?? null,
        fcf: r.fcf ?? (isNum(r.ocf) && isNum(r.capex) ? r.ocf - r.capex : null),
        totalDebt: r.totalDebt ?? null, cash: r.cash ?? null, equity: r.equity ?? null, totalAssets: r.totalAssets ?? null,
        currentAssets: r.currentAssets ?? null, currentLiabilities: r.currentLiabilities ?? null, interestExpense: r.interestExpense ?? null,
        taxExpense: r.taxExpense ?? null, pretaxIncome: r.pretaxIncome ?? null, rnd: r.rnd ?? null, sbc: r.sbc ?? null,
        buybacks: r.buybacks ?? null, dividends: r.dividends ?? null, retainedEarnings: r.retainedEarnings ?? null,
      }))
      .filter((r) => isNum(r.revenue) || isNum(r.netIncome))
      .sort((x, y) => x.end.localeCompare(y.end));

    const qMap = new Map<string, Partial<QuarterRow>>();
    const putQ = (type: string, field: keyof QuarterRow) => {
      for (const p of q[type] ?? []) {
        const row = qMap.get(p.date) ?? {};
        (row as Record<string, unknown>)[field] = p.v;
        qMap.set(p.date, row);
      }
    };
    putQ("quarterlyTotalRevenue", "revenue");
    putQ("quarterlyNetIncome", "netIncome");
    putQ("quarterlyDilutedEPS", "epsDiluted");
    putQ("quarterlyFreeCashFlow", "fcf");
    const quarterly: QuarterRow[] = [...qMap.entries()].map(([end, r]) => ({ end, revenue: r.revenue ?? null, netIncome: r.netIncome ?? null, epsDiluted: r.epsDiluted ?? null, fcf: r.fcf ?? null })).sort((x, y) => x.end.localeCompare(y.end));

    const rp = (type: string): RatioPoint[] => (t[type] ?? []).map((p) => ({ period: p.date, v: p.v }));
    return {
      annual,
      quarterly,
      trailing: { pe: rp("trailingPeRatio"), forwardPe: rp("trailingForwardPeRatio"), peg: rp("trailingPegRatio"), ps: rp("trailingPsRatio"), pb: rp("trailingPbRatio"), evEbitda: rp("trailingEnterprisesValueEBITDARatio"), ev: rp("trailingEnterpriseValue"), marketCap: rp("trailingMarketCap") },
    };
  });
}

/* ── Índices para el pulso de mercado ─────────────────────────────── */
export async function yahooIndex(symbol: string): Promise<{ price: number; changePct: number | null; high52: number | null; low52: number | null; closes1y: PricePoint[] }> {
  return cached(`yh:idx:${symbol}`, TTL.market, async () => {
    const r = await chart(symbol, "1y", "1d");
    return { price: r.meta.regularMarketPrice, changePct: r.meta.regularMarketChangePercent ?? null, high52: r.meta.fiftyTwoWeekHigh ?? null, low52: r.meta.fiftyTwoWeekLow ?? null, closes1y: toPoints(r) };
  });
}

export const _internal = { recordHealth };

/* ── ETFs: perfil, costos, participaciones y rentabilidad ──────────── */
export interface EtfHolding {
  symbol: string;
  name: string;
  weight: number; // %
}
export interface EtfProfile {
  symbol: string;
  name: string;
  category?: string;
  family?: string;
  legalType?: string;
  expenseRatio: N; // %
  aum: N; // USD
  dividendYield: N; // %
  beta3y: N;
  inception: string | null;
  holdings: EtfHolding[];
  holdingsCount: N; // total de posiciones del fondo (si Yahoo lo informa)
  sectors: Array<{ key: string; label: string; weight: number }>;
  returns: { ytd: N; y1: N; y3: N; y5: N; y10: N };
  annual: Array<{ year: string; value: number }>;
  equity: { pe: N; pb: N; ps: N; earningsGrowth: N };
  bondPct: N;
  cashPct: N;
  stockPct: N;
}

const SECTOR_ES: Record<string, string> = {
  technology: "Tecnología",
  financial_services: "Financiero",
  consumer_cyclical: "Consumo cíclico",
  consumer_defensive: "Consumo defensivo",
  healthcare: "Salud",
  communication_services: "Comunicación",
  industrials: "Industrial",
  energy: "Energía",
  utilities: "Servicios públicos",
  realestate: "Inmobiliario",
  basic_materials: "Materiales",
};

interface YEtf {
  quoteSummary: {
    result: Array<{
      fundProfile?: { categoryName?: string; family?: string; legalType?: string; feesExpensesInvestment?: { annualReportExpenseRatio?: Raw; netExpRatio?: Raw } };
      topHoldings?: {
        holdings?: Array<{ symbol: string; holdingName: string; holdingPercent?: Raw }>;
        sectorWeightings?: Array<Record<string, Raw>>;
        equityHoldings?: { priceToEarnings?: Raw; priceToBook?: Raw; priceToSales?: Raw; threeYearEarningsGrowth?: Raw };
        stockPosition?: Raw;
        bondPosition?: Raw;
        cashPosition?: Raw;
        annualReportExpenseRatio?: Raw;
      };
      fundPerformance?: {
        trailingReturns?: { ytd?: Raw; oneYear?: Raw; threeYear?: Raw; fiveYear?: Raw; tenYear?: Raw };
        annualTotalReturns?: { returns?: Array<{ year: string; annualValue?: Raw }> };
      };
      defaultKeyStatistics?: { totalAssets?: Raw; yield?: Raw; beta3Year?: Raw; fundInceptionDate?: Raw };
      summaryDetail?: { totalAssets?: Raw; yield?: Raw };
      price?: { longName?: string; shortName?: string };
    }> | null;
    error: { code: string; description: string } | null;
  };
}

const ETF_MODULES = "fundProfile,topHoldings,fundPerformance,defaultKeyStatistics,summaryDetail,price";

export async function yahooEtf(symbol: string): Promise<EtfProfile> {
  return cached(`yh:etf:${symbol}`, TTL.metrics, async () => {
    const d = await yfetch<YEtf>(`${Q2}/v10/finance/quoteSummary/${enc(symbol)}?modules=${ETF_MODULES}`, { crumb: true });
    const r = d.quoteSummary.result?.[0];
    if (!r) throw new ProviderError("yahoo", 404, d.quoteSummary.error?.description || "sin datos de ETF");
    const th = r.topHoldings ?? {};
    const fp = r.fundProfile ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const sd = r.summaryDetail ?? {};
    const pf = r.fundPerformance ?? {};
    const pctRaw = (x: Raw): N => (isNum(rv(x)) ? (rv(x) as number) * 100 : null);
    const inceptionTs = rv(ks.fundInceptionDate);
    return {
      symbol,
      name: r.price?.longName || r.price?.shortName || symbol,
      category: fp.categoryName,
      family: fp.family,
      legalType: fp.legalType,
      expenseRatio: pctRaw(fp.feesExpensesInvestment?.netExpRatio) ?? pctRaw(fp.feesExpensesInvestment?.annualReportExpenseRatio) ?? pctRaw(th.annualReportExpenseRatio),
      aum: rv(sd.totalAssets) ?? rv(ks.totalAssets),
      dividendYield: pctRaw(sd.yield) ?? pctRaw(ks.yield),
      beta3y: rv(ks.beta3Year),
      inception: isNum(inceptionTs) ? new Date((inceptionTs as number) * 1000).toISOString().slice(0, 10) : null,
      holdings: (th.holdings ?? [])
        .map((h) => ({ symbol: h.symbol, name: h.holdingName, weight: (rv(h.holdingPercent) ?? 0) * 100 }))
        .filter((h) => h.weight > 0),
      holdingsCount: null,
      sectors: (th.sectorWeightings ?? [])
        .flatMap((o) => Object.entries(o).map(([k, v]) => ({ key: k, label: SECTOR_ES[k] ?? k, weight: (rv(v) ?? 0) * 100 })))
        .filter((s) => s.weight > 0)
        .sort((a, b) => b.weight - a.weight),
      returns: {
        ytd: pctRaw(pf.trailingReturns?.ytd),
        y1: pctRaw(pf.trailingReturns?.oneYear),
        y3: pctRaw(pf.trailingReturns?.threeYear),
        y5: pctRaw(pf.trailingReturns?.fiveYear),
        y10: pctRaw(pf.trailingReturns?.tenYear),
      },
      annual: (pf.annualTotalReturns?.returns ?? [])
        .filter((x) => isNum(rv(x.annualValue)))
        .map((x) => ({ year: x.year, value: (rv(x.annualValue) as number) * 100 })),
      equity: {
        pe: isNum(rv(th.equityHoldings?.priceToEarnings)) ? 1 / (rv(th.equityHoldings?.priceToEarnings) as number) : null,
        pb: isNum(rv(th.equityHoldings?.priceToBook)) ? 1 / (rv(th.equityHoldings?.priceToBook) as number) : null,
        ps: isNum(rv(th.equityHoldings?.priceToSales)) ? 1 / (rv(th.equityHoldings?.priceToSales) as number) : null,
        earningsGrowth: pctRaw(th.equityHoldings?.threeYearEarningsGrowth),
      },
      stockPct: pctRaw(th.stockPosition),
      bondPct: pctRaw(th.bondPosition),
      cashPct: pctRaw(th.cashPosition),
    };
  });
}
