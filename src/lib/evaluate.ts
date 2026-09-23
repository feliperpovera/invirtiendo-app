/**
 * Orquestador: reúne datos de todos los proveedores (con degradación
 * elegante) y corre el motor de análisis completo para un símbolo.
 */
import type { Evaluation, Quote, Profile, Metrics, NewsItem, PeerRow, SourceStatus, ProviderName, RatioPoint, AnnualRow, QuarterRow, Fundamentals, AnalystView, InsiderView, EarningsSurprise, EarningsCalendar } from "./analysis/types";
import { platformEstimates } from "./providers/platforms";
import { yahooQuote, yahooHistory, yahooFundamentals, yahooProfileFromSearch, yahooNews, yahooIndex, yahooSummary, type YahooFundamentals, type YahooSummary } from "./providers/yahoo";
import { secAnnualHistory, secQuarterly } from "./providers/sec";
import { finnhubEnabled, finnhubQuote, finnhubProfile, finnhubMetrics, finnhubPeers, finnhubRecommendation, finnhubInsiders, finnhubNews, finnhubEarnings, finnhubEarningsCalendar } from "./providers/finnhub";
import { alphaEnabled, alphaNewsSentiment } from "./providers/alphavantage";
import { marketauxEnabled, marketauxNews } from "./providers/marketaux";
import { polygonEnabled, polygonNews } from "./providers/polygon";
import { pool } from "./providers/http";
import { cached } from "./providers/cache";
import { mergeAnnual, derive, industryProfile, splitAdjust, type Derived } from "./analysis/fundamentals";
import { defaultAssumptions, valuationPillar } from "./analysis/valuation";
import { businessPillar, moatPillar, qualityPillar, managementPillar, durabilityPillar } from "./analysis/pillars";
import { riskPillar } from "./analysis/risk";
import { mergeNews, sentimentPillar } from "./analysis/sentiment";
import { staticPeers, peersPillar } from "./analysis/peers";
import { buildBuffett } from "./analysis/buffett";
import { lynchPillar } from "./analysis/lynch";
import { buildFvHistory } from "./analysis/fvhistory";
import { buildScore, buildPlan } from "./analysis/score";
import { marketMultiples } from "./analysis/market";
import { isNum } from "./format";
import { xoomarShortInterest } from "./providers/xoomar";
import { wsbSentiment } from "./providers/tradestie";
import { usdCop } from "./providers/fx";

export class EvaluationError extends Error {
  code: "NOT_FOUND" | "ETF" | "UPSTREAM";
  extra?: unknown;
  constructor(code: EvaluationError["code"], message: string, extra?: unknown) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

type Settled<T> = { ok: true; v: T } | { ok: false; e: string };
const settle = async <T>(p: Promise<T>): Promise<Settled<T>> => {
  try {
    return { ok: true, v: await p };
  } catch (e) {
    return { ok: false, e: e instanceof Error ? e.message : String(e) };
  }
};
const val = <T>(s: Settled<T>): T | null => (s.ok ? s.v : null);
const err = <T>(s: Settled<T>): string => (s.ok ? "" : s.e);
const skip = <T>(): Promise<T> => Promise.reject(new Error("sin llave"));

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "").replace(/\.(?=[A-Z]$)/, "-"); // BRK.B → BRK-B (Yahoo)
}

/** Evaluación completa cacheada 5 minutos (la cotización se refresca aparte vía /api/quote). */
export function evaluateCached(raw: string): Promise<Evaluation> {
  const symbol = normalizeSymbol(raw);
  return cached(`eval:${symbol}`, 5 * 60 * 1000, () => evaluate(symbol));
}

/* ── Métricas calculadas desde fundamentales + quoteSummary (sin Finnhub) ── */
function computedMetrics(d: Derived, q: Quote, yf: YahooFundamentals | null, ys: YahooSummary | null, sharesOut: number | null): Metrics {
  const L = d.latest;
  const shares = ys?.sharesOutstanding ?? L?.sharesDiluted ?? sharesOut ?? null;
  const mcap = ys?.marketCap ?? yf?.trailing.marketCap.at(-1)?.v ?? (isNum(shares) ? q.price * shares : null);
  const eps = ys?.epsTTM ?? d.ttm.eps;
  const pe = ys?.pe ?? (isNum(eps) && eps > 0 ? q.price / eps : null);
  const lastRatio = (arr: RatioPoint[] | undefined) => arr?.at(-1)?.v ?? null;
  const rev = d.ttm.revenue;
  const ev = isNum(mcap) ? mcap + (ys?.totalDebt ?? L?.totalDebt ?? 0) - (ys?.totalCash ?? L?.cash ?? 0) : null;
  const bvps = ys?.bvps ?? (L && isNum(L.equity) && isNum(shares) && shares > 0 ? L.equity / shares : null);
  const per = d.per.at(-1);
  const epsPrev = d.rows.at(-2)?.epsDiluted ?? null;
  const fcfTtm = d.ttm.fcf ?? ys?.fcf ?? null;
  const hist = (f: (p: Derived["per"][number]) => number | null) => d.per.map((p) => ({ period: String(p.fy), v: f(p) as number })).filter((p) => isNum(p.v));
  return {
    pe,
    forwardPe: ys?.forwardPe ?? lastRatio(yf?.trailing.forwardPe),
    peg: ys?.peg ?? lastRatio(yf?.trailing.peg),
    ps: isNum(mcap) && isNum(rev) && rev > 0 ? mcap / rev : lastRatio(yf?.trailing.ps),
    pb: ys?.pb ?? (isNum(bvps) && bvps > 0 ? q.price / bvps : lastRatio(yf?.trailing.pb)),
    evEbitda: ys?.evEbitda ?? lastRatio(yf?.trailing.evEbitda),
    pFcf: isNum(mcap) && isNum(fcfTtm) && fcfTtm > 0 ? mcap / fcfTtm : null,
    dividendYield: ys?.dividendYield ?? (L && isNum(L.dividends) && isNum(mcap) && mcap > 0 ? (L.dividends / mcap) * 100 : null),
    payoutRatio: ys?.payoutRatio ?? (L && isNum(L.dividends) && isNum(L.netIncome) && L.netIncome > 0 ? (L.dividends / L.netIncome) * 100 : null),
    beta: ys?.beta ?? null,
    roe: ys?.roe ?? per?.roe ?? null,
    roic: per?.roic ?? null,
    roa: ys?.roa ?? (L && isNum(L.netIncome) && isNum(L.totalAssets) && L.totalAssets > 0 ? (L.netIncome / L.totalAssets) * 100 : null),
    grossMargin: ys?.grossMargin ?? per?.grossMargin ?? null,
    operatingMargin: ys?.operatingMargin ?? per?.opMargin ?? null,
    netMargin: ys?.netMargin ?? (isNum(d.ttm.netIncome) && isNum(rev) && rev > 0 ? (d.ttm.netIncome / rev) * 100 : (per?.netMargin ?? null)),
    revenueGrowthTTM: ys?.revenueGrowth ?? per?.revenueGrowth ?? null,
    revenueGrowth5Y: d.growth.revenue5y,
    epsGrowthTTM: ys?.earningsGrowth ?? (isNum(eps) && isNum(epsPrev) && epsPrev > 0 ? ((eps - epsPrev) / epsPrev) * 100 : (per?.epsGrowth ?? null)),
    epsGrowth5Y: d.growth.eps5y,
    debtToEquity: ys?.debtToEquity ?? d.balance.debtToEquity,
    currentRatio: ys?.currentRatio ?? d.balance.currentRatio,
    interestCoverage: d.balance.interestCoverage,
    epsTTM: eps,
    epsForward: (() => {
      const f = ys?.epsForward;
      if (!isNum(f) || f <= 0) return null;
      // Comparar contra el EPS TTM de la MISMA fuente: los estados de la SEC pueden
      // venir en otra moneda (ADRs) o sin ajustar por splits, y la comparación falla.
      const ttm = ys?.epsTTM ?? null;
      const sube = d.rows.length >= 3 && isNum(d.rows.at(-1)?.epsDiluted) && isNum(d.rows.at(-2)?.epsDiluted) && (d.rows.at(-1)!.epsDiluted as number) > (d.rows.at(-2)!.epsDiluted as number);
      // Si la empresa viene creciendo y el "estimado" es menor que lo ya reportado,
      // el dato está desactualizado: se ignora y se usa el EPS de los últimos 12 meses.
      if (sube && isNum(ttm) && ttm > 0 && f < ttm) return null;
      return f;
    })(),
    bvps,
    marketCap: mcap,
    enterpriseValue: ev,
    netDebt: isNum(ys?.totalDebt) || isNum(ys?.totalCash) ? (ys?.totalDebt ?? 0) - (ys?.totalCash ?? 0) : isNum(d.balance.netCash) ? -d.balance.netCash : null,
    high52: q.high52,
    low52: q.low52,
    analystTarget: ys?.analyst.targetMean ?? null,
    shortPctFloat: ys?.shortPctFloat ?? null,
    growthEstimate: (() => {
      const c = [ys?.growth.next5y, ys?.growth.nextYear].filter((x): x is number => isNum(x) && x > -30 && x < 250);
      if (!c.length) return null;
      const est = Math.min(40, c.reduce((a, b) => a + b, 0) / c.length);
      // Yahoo devuelve estimaciones negativas erróneas en empresas que sí crecen
      // (GOOGL −28%, AMZN −17%): si los resultados reales las contradicen, se descarta.
      const real5 = d.growth.eps5y ?? d.growth.netIncome5y;
      if (est < 0 && isNum(real5) && real5 > 10 && (d.growth.revenue3y ?? 0) > 5) return null;
      return est;
    })(),
    insidersPct: ys?.insiders.pct ?? null,
    institutionsPct: ys?.insiders.institutionsPct ?? null,
    history: {
      pe: yf?.trailing.pe ?? [],
      ps: yf?.trailing.ps ?? [],
      pb: yf?.trailing.pb ?? [],
      roe: hist((p) => p.roe),
      roic: hist((p) => p.roic),
      grossMargin: hist((p) => p.grossMargin),
      netMargin: hist((p) => p.netMargin),
      forwardPe: yf?.trailing.forwardPe ?? [],
      peg: yf?.trailing.peg ?? [],
      evEbitda: yf?.trailing.evEbitda ?? [],
    },
    sources: ["yahoo", "sec"],
  };
}

function mergeMetrics(primary: Metrics | null, fallback: Metrics): Metrics {
  if (!primary) return fallback;
  const out = { ...fallback } as Metrics;
  for (const k of Object.keys(fallback) as Array<keyof Metrics>) {
    if (k === "history" || k === "sources") continue;
    const pv = primary[k];
    if (isNum(pv)) (out as unknown as Record<string, unknown>)[k] = pv;
  }
  const H = { ...fallback.history };
  for (const k of Object.keys(H) as Array<keyof Metrics["history"]>) {
    if ((primary.history[k]?.length ?? 0) > (H[k]?.length ?? 0)) H[k] = primary.history[k];
  }
  out.history = H;
  out.sources = [...new Set([...primary.sources, ...fallback.sources])];
  return out;
}

function analystFromSummary(ys: YahooSummary | null): AnalystView | null {
  const t = ys?.analyst.trend;
  if (!t) return null;
  const total = t.strongBuy + t.buy + t.hold + t.sell + t.strongSell;
  if (!total) return null;
  const score = (t.strongBuy + t.buy * 0.5 - t.sell * 0.5 - t.strongSell) / total;
  const consensus = score > 0.55 ? "Compra fuerte" : score > 0.3 ? "Compra" : score > -0.1 ? "Mantener" : score > -0.4 ? "Venta" : "Venta fuerte";
  return { ...t, total, consensus, score };
}

function insidersFromSummary(ys: YahooSummary | null): InsiderView | null {
  const i = ys?.insiders;
  if (!i || (!isNum(i.buys) && !isNum(i.sells))) return null;
  const buys = i.buys ?? 0;
  const sells = i.sells ?? 0;
  const net = i.netPct;
  const mspr = isNum(net) ? Math.max(-100, Math.min(100, net * 10)) : buys + sells > 0 ? ((buys - sells) / (buys + sells)) * 100 : null;
  const note = isNum(mspr) ? (mspr > 20 ? "Insiders comprando netamente (6 meses)" : mspr < -20 ? "Insiders vendiendo netamente (6 meses; suele ser diversificación)" : "Actividad de insiders equilibrada (6 meses)") : "Sin datos de insiders";
  return { mspr, netChange: null, buys, sells, note: `${note} · ${isNum(i.pct) ? `insiders poseen ${i.pct.toFixed(1)}%` : ""}` };
}

function calendarFromSummary(ys: YahooSummary | null): EarningsCalendar | null {
  const d = ys?.nextEarnings.date;
  if (!d) return null;
  const daysUntil = Math.round((new Date(d).getTime() - Date.now()) / 86400000);
  return { nextDate: d, daysUntil, epsEstimate: ys!.nextEarnings.epsEstimate, revenueEstimate: ys!.nextEarnings.revenueEstimate };
}

/* ── Fila de par (para tabla de competidores) ─────────────────────── */
async function peerRow(symbol: string): Promise<PeerRow | null> {
  const [q, fm, ys] = await Promise.all([settle(finnhubEnabled() ? finnhubQuote(symbol) : yahooQuote(symbol)), settle(finnhubEnabled() ? finnhubMetrics(symbol) : skip<Metrics>()), settle(yahooSummary(symbol))]);
  if (!q.ok) return null;
  const m = val(fm);
  const s = val(ys);
  // El P/E que publican los proveedores usa la utilidad contable tal cual. Cuando el
  // margen neto supera al operativo por mucho, esa utilidad trae ganancias que no son
  // del negocio y el múltiplo engaña: Alphabet aparecía a 17x junto a Meta a 23x, con
  // un P/E adelantado MAYOR que el actual — la señal de que la utilidad de hoy no se
  // repite. Se recalcula sobre la utilidad operativa después de impuestos.
  const mn = m?.netMargin ?? s?.netMargin ?? null;
  const mo = m?.operatingMargin ?? s?.operatingMargin ?? null;
  const peCrudo = m?.pe ?? s?.pe ?? null;
  const peOperativo =
    isNum(peCrudo) && peCrudo > 0 && isNum(mn) && isNum(mo) && mo > 0 && mn > mo + 8 ? peCrudo * (mn / (mo * 0.79)) : peCrudo;
  return {
    symbol,
    name: q.v.name,
    price: q.v.price,
    marketCap: m?.marketCap ?? s?.marketCap ?? null,
    pe: peOperativo,
    forwardPe: s?.forwardPe ?? null,
    peg: s?.peg ?? m?.peg ?? null,
    ps: m?.ps ?? null,
    grossMargin: m?.grossMargin ?? s?.grossMargin ?? null,
    operatingMargin: m?.operatingMargin ?? s?.operatingMargin ?? null,
    roe: m?.roe ?? s?.roe ?? null,
    revenueGrowthTTM: m?.revenueGrowthTTM ?? s?.revenueGrowth ?? null,
  };
}

/* ── Evaluación completa ──────────────────────────────────────────── */
export async function evaluate(raw: string): Promise<Evaluation> {
  const symbol = normalizeSymbol(raw);
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol)) throw new EvaluationError("NOT_FOUND", "Símbolo inválido");
  const sources: SourceStatus[] = [];
  const warnings: string[] = [];
  const mark = (provider: ProviderName, ok: boolean, note: string) => sources.push({ provider, ok, note });
  const fh = finnhubEnabled();

  // 1) Cotización (Yahoo siempre: nombre, 52 semanas y tipo; Finnhub afina el precio en tiempo real)
  const [yq, fq] = await Promise.all([settle(yahooQuote(symbol)), settle(fh ? finnhubQuote(symbol) : skip<Quote>())]);
  if (!yq.ok && !fq.ok) throw new EvaluationError("NOT_FOUND", `No encontré cotización para ${symbol}. Revisa el símbolo (p. ej. NVDA, MSFT, BRK-B). Detalle: ${yq.e}`);
  let quote: Quote = yq.ok ? yq.v : (fq as { ok: true; v: Quote }).v;
  if (fq.ok && yq.ok) quote = { ...yq.v, price: fq.v.price, change: fq.v.change, changePct: fq.v.changePct, open: fq.v.open, high: fq.v.high, low: fq.v.low, prevClose: fq.v.prevClose, asOf: Math.max(fq.v.asOf, yq.v.asOf), source: "finnhub", delayed: false };
  mark("yahoo", yq.ok, yq.ok ? "Cotización e histórico de precios" : `Sin cotización Yahoo: ${err(yq)}`);
  if (fh) mark("finnhub", fq.ok, fq.ok ? "Cotización en tiempo real" : `Cotización: ${err(fq)}`);

  if (quote.quoteType && quote.quoteType !== "EQUITY") {
    throw new EvaluationError("ETF", `${symbol} es un ${quote.quoteType}. El evaluador Buffett es para acciones individuales; para ETFs usa el checklist ETF (exposición, costos, composición).`, { quote });
  }

  // 2) Todo lo demás en paralelo
  const [prof, hist, sec, secQ, yf, ysum, fm, fpeers, rec, ins, fnews, earn, cal, pgNews, ynews, spx, tnx, plat, finra, wsb, cop] = await Promise.all([
    settle(fh ? finnhubProfile(symbol) : skip<Profile>()),
    settle(yahooHistory(symbol)),
    settle(secAnnualHistory(symbol)),
    settle(secQuarterly(symbol)),
    settle(yahooFundamentals(symbol)),
    settle(yahooSummary(symbol)),
    settle(fh ? finnhubMetrics(symbol) : skip<Metrics>()),
    settle(fh ? finnhubPeers(symbol) : skip<string[]>()),
    settle(fh ? finnhubRecommendation(symbol) : Promise.resolve<AnalystView | null>(null)),
    settle(fh ? finnhubInsiders(symbol) : Promise.resolve<InsiderView | null>(null)),
    settle(fh ? finnhubNews(symbol) : Promise.resolve([] as NewsItem[])),
    settle(fh ? finnhubEarnings(symbol) : Promise.resolve([] as EarningsSurprise[])),
    settle(fh ? finnhubEarningsCalendar(symbol) : Promise.resolve<EarningsCalendar | null>(null)),
    settle(polygonEnabled() ? polygonNews(symbol) : skip<NewsItem[]>()),
    settle(yahooNews(symbol)),
    settle(yahooIndex("^GSPC")),
    settle(yahooIndex("^TNX")),
    settle(platformEstimates(symbol, quote.exchange)),
    // Complementos de APIs públicas sin llave: contexto, no entran al score
    settle(xoomarShortInterest(symbol)),
    settle(wsbSentiment(symbol)),
    settle(usdCop()),
  ]);
  const ys = val(ysum);
  mark("yahoo", ysum.ok, ysum.ok ? "Perfil, analistas, earnings, insiders y estimaciones (quoteSummary)" : `quoteSummary: ${err(ysum)}`);

  // Perfil
  const ysp = await yahooProfileFromSearch(symbol).catch(() => ({} as Partial<Profile>));
  const fp = val(prof);
  const profile: Profile = {
    symbol,
    name: fp?.name || ysp.name || quote.name || (val(sec)?.entity ?? symbol),
    exchange: fp?.exchange || ysp.exchange || quote.exchange,
    sector: ys?.sector || ysp.sector,
    industry: fp?.industry || ys?.industry || ysp.industry,
    country: fp?.country || ys?.country,
    ipo: fp?.ipo,
    marketCap: fp?.marketCap ?? ys?.marketCap ?? null,
    sharesOutstanding: fp?.sharesOutstanding ?? ys?.sharesOutstanding ?? null,
    website: fp?.website || ys?.website,
    logo: fp?.logo,
    description: ys?.description,
    employees: ys?.employees ?? null,
    quoteType: "EQUITY",
    source: fp ? "finnhub" : "yahoo",
  };
  const ind0 = industryProfile(profile.industry, profile.sector, symbol);

  // Fundamentales
  const secRows: AnnualRow[] = val(sec)?.rows ?? [];
  const yRows: AnnualRow[] = val(yf)?.annual ?? [];
  mark("sec", sec.ok && secRows.length > 0, sec.ok ? (secRows.length ? `${secRows.length} años de 10-K (XBRL)` : "Sin datos US-GAAP (¿empresa extranjera/IFRS?)") : `EDGAR: ${err(sec)}`);
  if (yf.ok) mark("yahoo", true, `Fundamentales ${yRows.length} años + múltiplos trailing`);
  else mark("yahoo", false, `Fundamentales: ${err(yf)}`);
  // Conteo de acciones. Yahoo devuelve UNA sola clase en empresas con acciones A/B/C
  // (Alphabet: 5.9B de las 12.2B reales), mientras que su capitalización sí las suma
  // todas. Se elige el candidato que concuerde con las acciones diluidas del 10-K.
  const secShares = [...secRows].reverse().find((r) => isNum(r.sharesDiluted) && (r.sharesDiluted as number) > 0)?.sharesDiluted ?? null;
  const capShares = isNum(ys?.marketCap) && quote.price > 0 ? (ys!.marketCap as number) / quote.price : null;
  let impliedShares = isNum(ys?.sharesOutstanding) ? ys!.sharesOutstanding! : capShares;
  if (isNum(secShares) && secShares > 0 && isNum(impliedShares) && isNum(capShares) && Math.abs(capShares / secShares - 1) < Math.abs(impliedShares / secShares - 1)) {
    impliedShares = capShares;
  }
  // Split posterior al último 10-K: la SEC no re-expresa los años ya publicados, Yahoo
  // sí ajusta precio y conteo. Se usan los splits REALES que reporta Yahoo, no un
  // múltiplo inferido del conteo de acciones: una escisión (Honeywell separó Solstice)
  // también cambia el conteo y no debe reescribir la historia auditada.
  // CrowdStrike partió 4:1 después de cerrar su año fiscal 2026.
  const ultimoCierre = [...secRows].reverse().find((r) => r.end)?.end ?? null;
  const splitFactor = (val(hist)?.splits ?? []).reduce((f, sp) => {
    if (!ultimoCierre || sp.t <= new Date(`${ultimoCierre}T23:59:59Z`).getTime()) return f;
    const [num, den] = String(sp.ratio).split(":").map(Number);
    if (!(num > 0) || !(den > 0)) return f;
    const r = num / den;
    // Solo splits de verdad (2:1, 4:1, 10:1, 1:5...). Yahoo también publica ajustes
    // fraccionarios por escisión (Honeywell separó Solstice en un "1.05:1") y esos NO
    // son un split: cambian el precio, no el número de acciones de cada dueño.
    const esSplit = (r >= 2 && Math.abs(r - Math.round(r)) < 0.02) || (r <= 0.5 && Math.abs(1 / r - Math.round(1 / r)) < 0.02);
    return esSplit ? f * r : f;
  }, 1);
  if (splitFactor !== 1) warnings.push(`Hubo un split ${splitFactor > 1 ? `${splitFactor}:1` : `1:${Math.round(1 / splitFactor)}`} después del último informe anual. La serie histórica se re-expresa para que el EPS y el precio hablen de la misma acción.`);
  const rows0 = mergeAnnual(secRows, yRows).map((r0) => {
    const r = splitFactor === 1 ? r0 : {
      ...r0,
      sharesDiluted: isNum(r0.sharesDiluted) ? r0.sharesDiluted * splitFactor : r0.sharesDiluted,
      epsDiluted: isNum(r0.epsDiluted) ? r0.epsDiluted / splitFactor : r0.epsDiluted,
    };
    // Algunos 10-K reportan acciones "en millones": si el conteo es 1000x menor que el real, re-escalar acciones y EPS
    if (isNum(impliedShares) && isNum(r.sharesDiluted) && r.sharesDiluted > 0 && r.sharesDiluted < impliedShares / 1000) {
      return { ...r, sharesDiluted: r.sharesDiluted * 1e6, epsDiluted: isNum(r.epsDiluted) && Math.abs(r.epsDiluted) > 1000 ? r.epsDiluted / 1e6 : r.epsDiluted };
    }
    return r;
  });
  // Cambio de entidad o de moneda en la serie: Nebius reporta en dólares desde 2024 pero
  // arrastra los años de Yandex N.V. en rublos (EPS de 82.53 junto a 0.33). Esos años son
  // otra empresa y otra moneda: envenenan crecimiento, márgenes y el gráfico histórico.
  const factoresSplit = (val(hist)?.splits ?? [])
    .map((sp) => { const [n, dd] = String(sp.ratio).split(":").map(Number); return n > 0 && dd > 0 ? n / dd : 1; })
    .filter((f) => f >= 1.8);
  const rows1 = (() => {
    const R = splitAdjust(rows0, factoresSplit);
    // Se mide sobre los INGRESOS, no sobre el EPS: un año de pérdidas hunde el EPS
    // (Amazon pasó de $3.24 a −$0.27 y sigue siendo Amazon) pero no cambia la escala de
    // los ingresos. Un cambio de moneda o de entidad sí mueve los ingresos de golpe.
    const med = (v: number[]) => { const o = [...v].sort((x, y) => x - y); return o.length ? o[Math.floor(o.length / 2)] : null; };
    const ing = R.map((r) => (isNum(r.revenue) && r.revenue > 0 ? r.revenue : null));
    // De más reciente a más antiguo: gana el corte más tardío que siga fuera de escala,
    // para no dejar dentro el último año de la entidad vieja.
    let corte = -1, mejor = 8;
    for (let i = R.length - 3; i >= 0; i--) {
      const viejo = ing.slice(0, i + 1).filter((x): x is number => isNum(x));
      const nuevo = ing.slice(i + 1).filter((x): x is number => isNum(x));
      if (viejo.length < 1 || nuevo.length < 2) continue;
      const mv = med(viejo), mn = med(nuevo);
      if (!isNum(mv) || !isNum(mn) || mn <= 0) continue;
      if (mv / mn > mejor) { mejor = mv / mn; corte = i; break; }
    }
    if (corte < 0) return R;
    warnings.push(`La serie anterior a ${R[corte].fy + 1} está en otra moneda o corresponde a otra entidad: los ingresos de esos años están ${mejor.toFixed(0)} veces fuera de escala. Se descartan para no envenenar el crecimiento.`);
    return R.slice(corte + 1);
  })();
  const rows = rows1;
  const qMerged = (() => {
    const m = new Map<string, QuarterRow>();
    // Los trimestres de la SEC vienen sin re-expresar por el split; los de Yahoo sí.
    for (const r of val(secQ) ?? []) m.set(r.end, splitFactor === 1 || !isNum(r.epsDiluted) ? r : { ...r, epsDiluted: (r.epsDiluted as number) / splitFactor });
    for (const r of val(yf)?.quarterly ?? []) {
      const cur = m.get(r.end);
      m.set(r.end, cur ? { ...cur, revenue: cur.revenue ?? r.revenue, netIncome: cur.netIncome ?? r.netIncome, epsDiluted: cur.epsDiluted ?? r.epsDiluted, fcf: cur.fcf ?? r.fcf } : r);
    }
    const sorted = [...m.values()].sort((a, b) => a.end.localeCompare(b.end));
    // SEC y Yahoo cierran el mismo trimestre con días distintos: fusionar los que estén a ≤12 días
    const out: QuarterRow[] = [];
    for (const r of sorted) {
      const last = out[out.length - 1];
      if (last && Math.abs(new Date(r.end).getTime() - new Date(last.end).getTime()) <= 12 * 86400000) {
        out[out.length - 1] = {
          end: r.end,
          revenue: last.revenue ?? r.revenue,
          netIncome: last.netIncome ?? r.netIncome,
          epsDiluted: last.epsDiluted ?? r.epsDiluted,
          fcf: last.fcf ?? r.fcf,
        };
      } else out.push(r);
    }
    return out;
  })();
  const fundamentals: Fundamentals = { annual: rows, quarterly: qMerged, sources: [...(secRows.length ? ["sec" as const] : []), ...(yRows.length ? ["yahoo" as const] : [])] };
  if (!rows.length) warnings.push("No encontré estados financieros. Los filtros de calidad no se pueden evaluar.");
  // Completar el EPS trimestral faltante con utilidad neta ÷ acciones diluidas del año más cercano
  for (const q of fundamentals.quarterly) {
    if (isNum(q.epsDiluted) || !isNum(q.netIncome)) continue;
    const y = Number(q.end.slice(0, 4));
    const near = rows.reduce<AnnualRow | null>((best, r) => (!best || Math.abs(r.fy - y) < Math.abs(best.fy - y) ? r : best), null);
    if (near && isNum(near.sharesDiluted) && near.sharesDiluted > 0) q.epsDiluted = q.netIncome / near.sharesDiluted;
  }
  const d = derive(rows, fundamentals.quarterly);

  // Métricas
  const computed = computedMetrics(d, quote, val(yf), ys, profile.sharesOutstanding);
  const metrics = mergeMetrics(val(fm), computed);
  if (fh) mark("finnhub", fm.ok, fm.ok ? "Métricas y ratios históricos (10 años)" : `Métricas: ${err(fm)}`);
  else warnings.push("Sin llave de Finnhub: ratios históricos limitados a 4 años y competidores de una lista fija. Consíguela gratis en Fuentes.");
  if (!isNum(metrics.marketCap) && isNum(profile.marketCap)) metrics.marketCap = profile.marketCap;
  if (!isNum(metrics.marketCap) && isNum(profile.sharesOutstanding)) metrics.marketCap = quote.price * profile.sharesOutstanding;
  const foreignStatements = !!ys?.financialCurrency && ys.financialCurrency !== "USD";
  // UNA sola cuenta de acciones y UNA sola capitalización para toda la app. Cuando cada
  // tabla toma la suya de un proveedor distinto, el mismo negocio sale con $1.5T en la
  // cabecera y $2T entre sus competidores, y las ventas por acción no cuadran con nada.
  // La cuenta buena es la DILUIDA del 10-K: incluye todas las clases de acciones, mientras
  // que Yahoo entrega solo la clase A (Meta: 2.24B de 2.57B reales; Alphabet: 5.9B de 12.2B).
  // Va con hasta un año de retraso, lo que subestima un poco la capitalización de quien
  // recompra: preferible a equivocarse por un 13%.
  const sharesCanon = isNum(d.latest?.sharesDiluted) && (d.latest!.sharesDiluted as number) > 0 ? (d.latest!.sharesDiluted as number) : impliedShares;
  if (!foreignStatements && isNum(sharesCanon) && sharesCanon > 0 && quote.price > 0) {
    metrics.marketCap = quote.price * sharesCanon;
    const revTtm = d.ttm.revenue ?? d.latest?.revenue ?? null;
    if (isNum(revTtm) && revTtm > 0) metrics.ps = metrics.marketCap / revTtm;
    if (isNum(metrics.bvps) && metrics.bvps > 0) metrics.pb = quote.price / metrics.bvps;
  }
  // El rendimiento por dividendo de Yahoo puede quedar congelado en un pago que ya no
  // existe: Intel seguía apareciendo con 2.68% después de suspenderlo, y ese 2.68% se
  // sumaba al P/E justo. Se contrasta contra los pagos REALES de los últimos 12 meses.
  if (isNum(metrics.dividendYield) && metrics.dividendYield > 0.2 && quote.price > 0) {
    const desde = Date.now() - 400 * 86400000;
    const pagados = (val(hist)?.dividends ?? []).filter((x) => x.t >= desde).reduce((a, x) => a + x.amount, 0);
    const real = (pagados / quote.price) * 100;
    if (real < metrics.dividendYield * 0.5) {
      warnings.push(`El rendimiento por dividendo publicado (${metrics.dividendYield.toFixed(2)}%) no coincide con lo pagado en los últimos 12 meses (${real.toFixed(2)}%). Se usa lo pagado.`);
      metrics.dividendYield = real > 0.05 ? real : null;
    }
  }

  // EPS TTM y P/E consistentes en toda la app: Yahoo trailingEps (incluye el último trimestre) > suma trimestral > Finnhub
  {
    const q4 = fundamentals.quarterly.slice(-4);
    const qSum = q4.length === 4 && q4.every((x) => isNum(x.epsDiluted)) ? q4.reduce((a, x) => a + (x.epsDiluted as number), 0) : null;
    const eps = ys?.epsTTM ?? qSum ?? metrics.epsTTM;
    if (isNum(eps)) {
      metrics.epsTTM = eps;
      metrics.pe = eps > 0 ? quote.price / eps : null;
    }
  }

  // Mega-cap de calidad en sector cíclico (NVDA, TSM, ASML): márgenes y ROIC de monopolio técnico.
  // Se trata como núcleo (tasa 9.5%) y no como cíclica pura, aunque el riesgo de ciclo se sigue anotando.
  const megaQuality = isNum(metrics.marketCap) && metrics.marketCap > 200e9 && (metrics.grossMargin ?? 0) > 50 && ((metrics.roic ?? d.avg5.roic ?? 0) > 25 || (metrics.operatingMargin ?? 0) > 30) && (d.stability.grossMarginStdev ?? 99) <= 8;
  const hardCyclical = ["MU", "SNDK", "WDC", "STX"].includes(symbol);
  const ind = ind0.cyclical && megaQuality && !hardCyclical ? { ...ind0, cyclical: false, baseDiscount: 9.5, label: `${ind0.label} · mega-cap de calidad` } : ind0;
  if (ind0.cyclical && megaQuality) warnings.push("Sector cíclico, pero con márgenes y ROIC de monopolio técnico: se evalúa como núcleo. Vigila igual el ciclo (inventarios, capex de clientes).");

  // Histórico de precios: si falló en la ráfaga (429), un segundo intento ya sin competencia
  const hist2 = hist.ok ? hist : await settle(yahooHistory(symbol));
  const history = val(hist2) ?? { symbol, daily: [], weekly: [], monthly: [], source: "yahoo" as const };
  if (!hist2.ok) warnings.push(`Sin histórico de precios (${err(hist2).slice(0, 60)}): volatilidad, caída máxima y beta no disponibles.`);
  const tenYear = val(tnx)?.price ?? null;

  // Fallbacks desde quoteSummary cuando no hay Finnhub
  const analyst = val(rec) ?? analystFromSummary(ys);
  const insiders = val(ins) ?? insidersFromSummary(ys);
  const surprises = (val(earn) ?? []).length ? (val(earn) as EarningsSurprise[]) : (ys?.surprises ?? []).filter((s) => isNum(s.surprisePct));
  const calendar = val(cal) ?? calendarFromSummary(ys);

  // Pilares
  const business = businessPillar(d, metrics, profile, ind);
  const moat = moatPillar(d, metrics, ind);
  const quality = qualityPillar(d, metrics);
  const management = managementPillar(d, insiders, surprises);
  const durability = durabilityPillar(d, profile, ind, history);

  // Valoración
  const assumptions = defaultAssumptions(d, metrics, { baseDiscount: ind.baseDiscount, tenYear, cyclical: ind.cyclical, marketCap: metrics.marketCap });
  if (isNum(sharesCanon) && sharesCanon > 0) assumptions.sharesDiluted = sharesCanon; // la misma cuenta que la capitalización
  if (!(assumptions.sharesDiluted > 0) && isNum(profile.sharesOutstanding)) assumptions.sharesDiluted = profile.sharesOutstanding;
  if (foreignStatements) {
    // Estados financieros en otra moneda (ADR): el DCF por acción no es comparable. Fair Value = utilidades (EPS en USD por ADR).
    assumptions.baseFcf = 0;
    assumptions.netCash = 0;
    metrics.pFcf = null;
    // EV/EBITDA cruza una capitalización en dólares con un EBITDA en moneda local:
    // TSMC salía en 4.7x cuando su múltiplo real ronda 13-15x. Mejor no mostrarlo.
    metrics.evEbitda = null;
    profile.statementCurrency = ys!.financialCurrency;
    warnings.push(`Estados financieros en ${ys!.financialCurrency}: el histórico de ingresos y EPS está en esa moneda, no en dólares. El Fair Value sí está en dólares por ADR.`);
  }
  const plataformas = val(plat) ?? { estimates: [], forecast: null, fallidas: ["todas"] };
  const valuation = valuationPillar(quote.price, d, metrics, assumptions, { estimates: ys?.estimates ?? null, forecast: plataformas.forecast, platforms: plataformas.estimates, platformsFailed: plataformas.fallidas, analyst: ys?.analyst ?? null, cyclical: ind.cyclical, sharesOutstanding: profile.sharesOutstanding, foreignStatements, financial: /financ|bank|insur|capital market|asset manage/i.test(`${profile.sector ?? ""} ${profile.industry ?? ""}`) });

  // Riesgo
  // Yahoo publica la capitalización de un ADR en la moneda de los estados, no en dólares:
  // TSMC aparecía con $62 billones frente a un precio de $417. Sin el ratio del ADR no
  // hay forma de convertirla, y un dato 30x equivocado es peor que ninguno. El motor ya
  // la usó arriba (topes de crecimiento por tamaño); a partir de aquí se oculta.
  if (foreignStatements && isNum(metrics.marketCap) && quote.price > 0) {
    const accionesImplicitas = metrics.marketCap / quote.price;
    const referencia = isNum(impliedShares) ? impliedShares : (d.latest?.sharesDiluted ?? null);
    if (isNum(referencia) && referencia > 0 && accionesImplicitas > referencia * 3) {
      warnings.push(`La capitalización que publica Yahoo está en ${ys?.financialCurrency ?? "moneda local"} y no es comparable con el precio del ADR en dólares: se omite.`);
      metrics.marketCap = null;
    }
  }
  const risk = riskPillar(quote, d, metrics, history, calendar, ind, quality.passCount, val(spx)?.closes1y ?? null);

  // Noticias y sentimiento. Alpha Vantage (25/día) y Marketaux (100/día) son solo respaldo:
  // se consultan uno tras otro únicamente si Polygon no trajo noticias. Antes iban en paralelo en
  // cada evaluación y el ranking diario (108 acciones) agotaba sus cupos todos los días.
  const noPedida: Settled<NewsItem[]> = { ok: true, v: [] };
  let avNews: Settled<NewsItem[]> = noPedida;
  let mxNews: Settled<NewsItem[]> = noPedida;
  const hayPolygon = pgNews.ok && pgNews.v.length > 0;
  if (!hayPolygon && alphaEnabled()) avNews = await settle(alphaNewsSentiment(symbol));
  if (!hayPolygon && !(avNews.ok && avNews.v.length) && marketauxEnabled()) mxNews = await settle(marketauxNews(symbol));
  let primary: NewsItem[] = [];
  let provider: ProviderName = "lexicon";
  if (pgNews.ok && pgNews.v.length) {
    primary = pgNews.v;
    provider = "polygon";
  } else if (avNews.ok && avNews.v.length) {
    primary = avNews.v;
    provider = "alphavantage";
  } else if (mxNews.ok && mxNews.v.length) {
    primary = mxNews.v;
    provider = "marketaux";
  }
  if (polygonEnabled()) mark("polygon", pgNews.ok, pgNews.ok ? `${pgNews.v.length} noticias con sentimiento por ticker` : `Polygon: ${err(pgNews)}`);
  if (avNews !== noPedida) mark("alphavantage", avNews.ok, avNews.ok ? `${avNews.v.length} noticias con sentimiento` : `Alpha Vantage: ${err(avNews)}`);
  if (mxNews !== noPedida) mark("marketaux", mxNews.ok, mxNews.ok ? `${mxNews.v.length} noticias` : `Marketaux: ${err(mxNews)}`);
  const news = mergeNews(primary, val(avNews) ?? [], val(mxNews) ?? [], val(fnews) ?? [], val(ynews) ?? []);
  const sentiment = sentimentPillar(news, analyst, insiders, surprises, provider);

  // Competidores
  let peerSyms = (val(fpeers) ?? []).length ? (val(fpeers) as string[]).slice(0, 5) : staticPeers(symbol).slice(0, 5);
  peerSyms = peerSyms.filter((s) => s !== symbol);
  let peerRows = (await pool(peerSyms, 3, (s) => peerRow(s).catch(() => null))).filter((r): r is PeerRow => !!r);
  if (peerRows.length < 3) {
    const extra = staticPeers(symbol).filter((s) => s !== symbol && !peerRows.some((r) => r.symbol === s)).slice(0, 4);
    const more = (await pool(extra, 2, (s) => peerRow(s).catch(() => null))).filter((r): r is PeerRow => !!r);
    peerRows = [...peerRows, ...more];
  }
  const subjectRow: PeerRow = {
    symbol,
    name: profile.name,
    price: quote.price,
    marketCap: metrics.marketCap,
    pe: valuation.multiples.pe,
    forwardPe: metrics.forwardPe,
    peg: valuation.multiples.peg,
    ps: metrics.ps,
    grossMargin: metrics.grossMargin,
    operatingMargin: metrics.operatingMargin,
    roe: metrics.roe,
    revenueGrowthTTM: metrics.revenueGrowthTTM ?? d.per.at(-1)?.revenueGrowth ?? null,
  };
  const mm = marketMultiples();
  const isTech = /tech|software|semi|internet|media|communication/i.test(`${profile.sector} ${profile.industry}`);
  const peers = peersPillar(subjectRow, peerRows, { name: isTech ? "Nasdaq-100" : "S&P 500", forwardPe: isTech ? mm.ndx : mm.spx, pe: null });

  // Lynch, veredicto Buffett, score, plan
  const lynch = lynchPillar(d, metrics, quote.price, ind, insiders);
  const fvHistory = buildFvHistory(fundamentals.quarterly, {
    fairPe: valuation.lynch.fairPe,
    fairValueNow: valuation.intrinsic.blended,
    growth: assumptions.growthYears1to5,
    analystTarget: metrics.analystTarget,
    nextEarnings: calendar?.nextDate ?? null,
    // El histórico se expresa en la misma base de EPS que el Fair Value de hoy
    epsScale: isNum(metrics.epsTTM) && metrics.epsTTM > 0 && valuation.lynch.eps > 0 ? valuation.lynch.eps / metrics.epsTTM : 1,
    soloReferencia: false,
  });
  const buffett = buildBuffett({ business, moat, quality, management, durability, valuation });
  const score = buildScore({ moat, quality, management, durability }, valuation, risk, sentiment, peers, buffett, d, metrics);
  const plan = buildPlan(quote.price, valuation, risk, score.signal.key, d, profile, ind, ind.moatHint, buffett.failedCore);

  return {
    symbol,
    asOf: Date.now(),
    quote,
    profile,
    history,
    fundamentals,
    metrics,
    earningsCalendar: calendar,
    pillars: { business, moat, quality, management, durability },
    valuation,
    risk,
    sentiment,
    peers,
    lynch,
    fvHistory,
    buffett,
    score,
    plan,
    sources,
    warnings,
    complementos: { shortInterest: val(finra), wsb: val(wsb), usdCop: val(cop) },
  };
}
