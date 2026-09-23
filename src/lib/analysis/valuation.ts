import type { DcfAssumptions, Metrics, N, ValuationResult, CheckItem, Verdict } from "./types";
import type { YahooSummary } from "@/lib/providers/yahoo";
import type { Forecast } from "@/lib/providers/platforms";
import { expectedGrowthForward, justifiedForwardPe, fairValueMedian, PE_MAX, PE_MIN, PRUDENCIA, DISPERSION_MAX, type PlatformEstimate } from "./forward";
import type { Derived } from "./fundamentals";
import { isNum, avg, median, clamp, fmtMoney, fmtPct, fmtX } from "@/lib/format";
import { expectedGrowth } from "./growth";

/* ── DCF ───────────────────────────────────────────────────────────── */
export interface DcfOutput {
  perShare: N;
  equityValue: number;
  pvFcf: number;
  pvTerminal: number;
  path: Array<{ year: number; fcf: number; pv: number; growth: number }>;
}

export function runDcf(a: DcfAssumptions): DcfOutput {
  const r = a.discountRate / 100;
  const gT = a.terminalGrowth / 100;
  const g1 = a.growthYears1to5 / 100;
  const g2 = a.growthYears6to10 / 100;
  let fcf = a.baseFcf;
  let pv = 0;
  const path: DcfOutput["path"] = [];
  for (let y = 1; y <= 10; y++) {
    // años 1-5: g1 · años 6-10: desvanece linealmente de g2 a gT
    const g = y <= 5 ? g1 : g2 + ((gT - g2) * (y - 6)) / 4;
    fcf = fcf * (1 + g);
    const d = fcf / Math.pow(1 + r, y);
    pv += d;
    path.push({ year: y, fcf, pv: d, growth: g * 100 });
  }
  const rr = Math.max(r, gT + 0.005);
  const tv = (fcf * (1 + gT)) / (rr - gT);
  const pvTv = tv / Math.pow(1 + r, 10);
  const equity = pv + pvTv + a.netCash;
  const perShare = a.sharesDiluted > 0 ? equity / a.sharesDiluted : null;
  return { perShare, equityValue: equity, pvFcf: pv, pvTerminal: pvTv, path };
}

/** Crecimiento implícito (años 1-5) que justifica el precio actual. */
export function reverseDcf(price: number, a: DcfAssumptions): N {
  if (!(a.baseFcf > 0) || !(a.sharesDiluted > 0)) return null;
  let lo = -30;
  let hi = 80;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const v = runDcf({ ...a, growthYears1to5: mid, growthYears6to10: Math.max(a.terminalGrowth, mid / 2) }).perShare;
    if (!isNum(v)) return null;
    if (v > price) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

/* ── Supuestos por defecto ──────────────────────────────────────── */
export function defaultAssumptions(
  d: Derived,
  m: Metrics,
  opts: { baseDiscount: number; tenYear: N; cyclical: boolean; marketCap: N; sbcAdjust?: boolean },
): DcfAssumptions {
  const L = d.latest;
  // FCF base normalizado. Si el FCF crece de forma sostenida 3 años, el dato más
  // reciente (TTM) es la mejor base; si es errático, la mediana de 3 años evita picos.
  const ttmFcf = d.ttm.fromQuarters && isNum(d.ttm.fcf) && d.ttm.fcf > 0 ? d.ttm.fcf : null;
  const last3 = [...d.rows.slice(-3).map((r) => r.fcf)];
  if (isNum(ttmFcf)) last3.push(ttmFcf); // la serie termina en el TTM real
  const s3 = last3.slice(-3);
  const monotonic = s3.length === 3 && s3.every(isNum) && (s3[0] as number) < (s3[1] as number) && (s3[1] as number) < (s3[2] as number);
  let base: number;
  if (opts.cyclical) {
    // Cíclica: recorte de ciclo. Base = 65% del FCF actual (TTM o último anual); nunca el pico completo.
    const cur = ttmFcf ?? (isNum(d.latest?.fcf) ? (d.latest!.fcf as number) : null);
    base = isNum(cur) && cur > 0 ? cur * 0.65 : Math.max(0, d.ttm.netIncome ?? 0) * 0.5;
  } else if (monotonic) {
    base = s3[2] as number;
  } else {
    const med = median(last3);
    base = isNum(med) && med > 0 ? med : (d.ttm.fcf ?? d.ttm.netIncome ?? 0);
    if (isNum(d.ttm.fcf) && d.ttm.fcf > base * 1.3 && d.ttm.fromQuarters) base = (base + d.ttm.fcf) / 2;
  }
  // Ciclo de inversión: si el CapEx/ingresos actual dobla su promedio de 5 años (p. ej. capex IA
  // de los hyperscalers), parte de ese CapEx es crecimiento, no mantenimiento. Base = ½ FCF + ½ utilidad neta.
  const capexInt = d.rows.slice(-6).map((r) => (isNum(r.capex) && isNum(r.revenue) && r.revenue > 0 ? r.capex / r.revenue : null));
  const capexNow = capexInt.at(-1);
  const capexAvg = avg(capexInt.slice(0, -1));
  const ni = d.ttm.netIncome ?? L?.netIncome ?? null;
  const capexCycle = isNum(capexNow) && isNum(capexAvg) && capexAvg > 0 && capexNow > capexAvg * 1.6;
  const fcfDepressed = isNum(ni) && ni > 0 && base < ni * 0.4;
  if ((capexCycle || fcfDepressed) && isNum(ni) && ni > base && base >= 0) {
    base = (base + ni) / 2; // owner earnings: parte del capex es crecimiento, no mantenimiento
  }
  const sbcAdjust = opts.sbcAdjust ?? true;
  if (sbcAdjust && isNum(L?.sbc) && base > 0) base = Math.max(base - L!.sbc!, base * 0.5);

  // Crecimiento esperado años 1-5: la MISMA estimación que usa Lynch (ver growth.ts)
  const eg = expectedGrowth(d, m, { cyclical: opts.cyclical });
  let g1 = isNum(eg.g) ? eg.g : 8;
  const hyper = isNum(m.revenueGrowthTTM) && m.revenueGrowthTTM > 40 && isNum(m.growthEstimate) && m.growthEstimate > 30;
  if (hyper && !opts.cyclical) g1 = Math.min(30, Math.max(g1, 25));
  // Ley de los grandes números: >$1T no compone 25%+ diez años; >$500B tampoco 30%
  if (isNum(opts.marketCap) && opts.marketCap > 1e12) g1 = Math.min(g1, 18);
  else if (isNum(opts.marketCap) && opts.marketCap > 500e9) g1 = Math.min(g1, 22);
  const terminal = 2.75;
  const g2 = clamp(g1 / 2, terminal, 12);

  // Tasa de descuento: base por perfil + sensibilidad al bono a 10 años (referencia 4.25%)
  let rate = opts.baseDiscount;
  if (isNum(opts.tenYear)) rate += clamp((opts.tenYear - 4.25) * 0.5, -0.75, 1.0);
  if (isNum(opts.marketCap) && opts.marketCap > 500e9 && !opts.cyclical) rate -= 0.5; // mega-cap de calidad
  if (isNum(m.beta) && m.beta > 1.5) rate += 0.75;
  rate = clamp(rate, 8, 13);

  const shares = m.marketCap && L?.sharesDiluted ? L.sharesDiluted : (L?.sharesDiluted ?? 0);
  const netCash = isNum(d.balance.netCash) ? d.balance.netCash : 0;
  return {
    discountRate: round1(rate),
    growthYears1to5: round1(g1),
    growthYears6to10: round1(g2),
    terminalGrowth: terminal,
    baseFcf: Math.round(base),
    sharesDiluted: shares,
    netCash: Math.round(netCash),
    sbcAdjust,
  };
}

const round1 = (x: number) => Math.round(x * 10) / 10;

/* ── Valoración: UN solo modelo, mirando hacia adelante ─────────── */
/**
 * Método de The Intelligent Investor (rankingstock.com), tal como lo aplica en sus videos:
 *  1. La acción vale lo que ganará el PRÓXIMO año fiscal (EPS de consenso) por el múltiplo
 *     que justifica su crecimiento esperado: forward P/E justo ≈ crecimiento (%), acotado
 *     10-22x y calculado sobre el crecimiento RECORTADO (ver PRUDENCIA en forward.ts),
 *     porque el consenso llega sistemáticamente alto y pagar PEG = 1 sobre una cifra
 *     optimista es optimismo al cuadrado.
 *  2. Ese número se contrasta con plataformas independientes (GuruFocus, ValueInvesting.io)
 *     y con el precio objetivo de los analistas RECORTADO, y el Fair Value final es la MEDIANA.
 *  3. Trampa de valor: crecimiento esperado bajo y desacelerando frente a su propia historia.
 * Nada subjetivo: consenso, plataformas y umbrales.
 */
export function valuationPillar(
  price: number,
  d: Derived,
  m: Metrics,
  a: DcfAssumptions,
  ctx: {
    estimates?: YahooSummary["estimates"] | null;
    forecast?: Forecast | null;
    platforms?: PlatformEstimate[];
    platformsFailed?: string[];
    analyst?: YahooSummary["analyst"] | null;
    cyclical: boolean;
    sharesOutstanding: N;
    foreignStatements?: boolean;
    financial?: boolean;
  },
): ValuationResult {
  const shares = a.sharesDiluted > 0 ? a.sharesDiluted : (ctx.sharesOutstanding ?? 0);
  const mcap = isNum(m.marketCap) && m.marketCap > 0 ? m.marketCap : shares > 0 ? price * shares : null;
  const eps = isNum(m.epsTTM) && m.epsTTM !== 0 ? m.epsTTM : d.ttm.eps;
  const pe = isNum(m.pe) && m.pe > 0 ? m.pe : isNum(eps) && eps > 0 ? price / eps : null;
  const cutoffD = new Date();
  cutoffD.setFullYear(cutoffD.getFullYear() - 5);
  const cutoff = cutoffD.toISOString().slice(0, 10);
  const peHist = m.history.pe.filter((p) => p.period >= cutoff && p.v > 4 && p.v < 90).map((p) => p.v);
  const peAvg5y = peHist.length >= 2 ? avg(peHist) : null;
  const psHist = m.history.ps.filter((p) => p.period >= cutoff && p.v > 0 && p.v < 80).map((p) => p.v);
  const psAvg5y = psHist.length >= 2 ? avg(psHist) : null;
  const notes: string[] = [];

  // ── 1. Consenso: EPS e ingresos de este año y el próximo (Yahoo primero, StockAnalysis de respaldo)
  const e = ctx.estimates ?? null;
  const f = ctx.forecast ?? null;
  const epsThisYear = e?.eps0 ?? f?.epsThisYear ?? null;
  const epsNextYear = e?.eps1 ?? f?.epsNextYear ?? m.epsForward ?? null;
  const revenueThisYear = e?.rev0 ?? f?.revenueThisYear ?? null;
  const revenueNextYear = e?.rev1 ?? f?.revenueNextYear ?? null;
  const epsGrowthThisYear = e?.epsG0 ?? f?.epsGrowthThisYear ?? null;
  const epsGrowthNextYear = e?.epsG1 ?? f?.epsGrowthNextYear ?? null;
  const revGrowthThisYear = e?.revG0 ?? f?.revGrowthThisYear ?? null;
  const revGrowthNextYear = e?.revG1 ?? f?.revGrowthNextYear ?? null;
  const eg = expectedGrowthForward({ epsG0: epsGrowthThisYear, epsG1: epsGrowthNextYear, revG0: revGrowthThisYear, revG1: revGrowthNextYear }, m.growthEstimate ?? expectedGrowth(d, m, { cyclical: ctx.cyclical }).g);
  const growthUsed = eg.g;

  // ── 2. Modelo adelantado
  const fairPe = justifiedForwardPe(growthUsed);
  const modelValue = isNum(epsNextYear) && epsNextYear > 0 && isNum(fairPe) ? epsNextYear * fairPe : null;
  if (!isNum(modelValue))
    notes.push(
      "Sin utilidad estimada positiva para el próximo año no hay Fair Value. Este método valora utilidades: si no se espera que la empresa gane dinero, el DCF de una plataforma o el precio objetivo de un analista no alcanzan para decir que está barata. Se mira, no se compra por precio.",
    );

  // ── 3. Plataformas + objetivo de analistas → mediana
  const platforms: PlatformEstimate[] = [...(ctx.platforms ?? [])];
  const an = ctx.analyst ?? null;
  if (isNum(an?.targetMean) && (an!.targetMean as number) > 0) platforms.push({ fuente: "Yahoo Finance · objetivo analistas", tipo: "objetivo", valor: an!.targetMean as number, url: "" });
  const { fairValue: mediana, componentes } = fairValueMedian(modelValue, platforms);
  // Sin modelo propio no se publica Fair Value: las fuentes de afuera quedan de referencia,
  // pero no fabrican un descuento. Es lo que evitaba que Rivian saliera "140% barata".
  const blended = isNum(modelValue) ? mediana : null;
  const mos = isNum(blended) ? ((blended - price) / price) * 100 : null;

  // ── 4. Trampa de valor: crece poco Y desacelera frente a su propia historia
  const revHist3 = d.growth.revenue3y;
  const valueTrap = isNum(growthUsed) && growthUsed < 10 && isNum(revGrowthNextYear) && isNum(revHist3) && revGrowthNextYear < revHist3 - 3;
  if (valueTrap) notes.push(`Riesgo de trampa de valor: el consenso espera ${fmtPct(revGrowthNextYear, 0)} de crecimiento de ingresos el próximo año frente a ${fmtPct(revHist3, 0)} anual en los últimos tres. Un múltiplo bajo con crecimiento que se apaga no es descuento, es deterioro.`);

  const forwardPe = isNum(epsNextYear) && epsNextYear > 0 ? price / epsNextYear : m.forwardPe;
  const pegFwd = isNum(forwardPe) && isNum(growthUsed) && growthUsed > 0 ? forwardPe / growthUsed : null;
  const fcfTtm = d.ttm.fcf;
  const pFcf = isNum(mcap) && isNum(fcfTtm) && fcfTtm > 0 ? mcap / fcfTtm : (m.pFcf ?? null);
  const fcfYield = isNum(pFcf) && pFcf > 0 ? 100 / pFcf : null;
  const earningsYield = isNum(pe) && pe > 0 ? 100 / pe : null;
  const premiumVsHistory = isNum(pe) && isNum(peAvg5y) ? (pe / peAvg5y - 1) * 100 : null;
  const vals = componentes.map((c) => c.valor);
  const dispersion = vals.length >= 2 && isNum(blended) && blended > 0 ? ((Math.max(...vals) - Math.min(...vals)) / blended) * 100 : null;
  const targetUpside = isNum(an?.targetMean) ? (((an!.targetMean as number) - price) / price) * 100 : null;

  const items: CheckItem[] = [
    { key: "mos", label: "Margin of Safety frente al Fair Value", value: fmtPct(mos, 0, true), pass: isNum(mos) ? mos >= 15 : null, detail: isNum(blended) ? `Fair Value ${fmtMoney(blended)} vs precio ${fmtMoney(price)}` : "Sin Fair Value" },
    { key: "fpeg", label: "Forward P/E frente al crecimiento esperado", value: isNum(forwardPe) && isNum(growthUsed) ? `${fmtX(forwardPe)} vs ${fmtPct(growthUsed, 0)}` : "—", pass: isNum(pegFwd) ? pegFwd <= 1.5 : null, detail: "La regla del método: el múltiplo no debería pasar del crecimiento (PEG adelantado ≤ 1.5)" },
    { key: "growth", label: "Crecimiento esperado del EPS (consenso)", value: fmtPct(growthUsed, 0), pass: isNum(growthUsed) ? growthUsed >= 10 : null, detail: eg.fuente },
    { key: "target", label: "Precio objetivo promedio de analistas", value: isNum(an?.targetMean) ? `${fmtMoney(an!.targetMean)} (${fmtPct(targetUpside, 0, true)})` : "—", pass: isNum(targetUpside) ? targetUpside > 0 : null, detail: isNum(an?.count) ? `${an!.count} analistas · rango ${fmtMoney(an?.targetLow)}–${fmtMoney(an?.targetHigh)}` : "" },
    { key: "acuerdo", label: "Acuerdo entre fuentes de Fair Value", value: isNum(dispersion) ? `${componentes.length} fuentes · dispersión ${fmtPct(dispersion, 0)}` : `${componentes.length} fuente${componentes.length === 1 ? "" : "s"}`, pass: isNum(dispersion) ? dispersion <= 40 : null, detail: `Si se separan más de 40% el número es menos fiable; pasado ${DISPERSION_MAX}% la señal no puede ser de compra` },
    { key: "fcfy", label: "Rendimiento FCF (FCF ÷ capitalización)", value: fmtPct(fcfYield, 1), pass: isNum(fcfYield) ? fcfYield >= 3 : null, detail: "≥ 3% compite con el bono del Tesoro" },
  ];

  let score: N = null;
  if (isNum(mos)) {
    score = mos >= 35 ? 95 : mos >= 25 ? 88 : mos >= 15 ? 76 : mos >= 0 ? 60 : mos >= -10 ? 48 : mos >= -25 ? 32 : 15;
    if (isNum(pegFwd)) score += pegFwd < 1 ? 5 : pegFwd > 2 ? -6 : 0;
    if (valueTrap) score -= 10;
    score = clamp(score, 0, 100);
  }
  const verdict: Verdict = !isNum(mos) ? "DUDOSO" : mos >= 15 ? "PASA" : mos >= -10 ? "DUDOSO" : "FALLA";
  if (isNum(modelValue)) notes.push(`Modelo adelantado: EPS estimado del próximo año ${fmtMoney(epsNextYear)} × P/E justo ${fairPe!.toFixed(1)}x (crecimiento esperado ${fmtPct(growthUsed, 0)} por ${eg.fuente}, recortado al ${Math.round(PRUDENCIA * 100)}% por prudencia y acotado entre ${PE_MIN}x y ${PE_MAX}x) = ${fmtMoney(modelValue)}.`);
  if (isNum(forwardPe) && isNum(pe) && forwardPe > pe)
    notes.push(
      `El forward P/E (${fmtX(forwardPe)}) queda por encima del P/E actual (${fmtX(pe)}): el consenso estima para el próximo año una utilidad por acción MENOR que la de los últimos doce meses. Suele pasar cuando el resultado reciente trae ganancias que no se repiten, o cuando el ciclo está en su punto alto. No es un error de los datos, es la señal de que lo de atrás no es lo de adelante.`,
    );
  notes.push(`Fair Value = mediana de ${componentes.length} fuentes: ${componentes.map((c) => `${c.fuente} ${fmtMoney(c.valor)}`).join(" · ")}.`);
  if (ctx.platformsFailed?.length) notes.push(`Sin respuesta de ${ctx.platformsFailed.join(", ")} en esta consulta. Morningstar, Investing.com, Simply Wall St y Alpha Spread no publican su Fair Value sin suscripción.`);
  if (isNum(mos) && mos > 40) notes.push("Margen >40%: desconfía. Casi siempre hay algo que el mercado sabe y el consenso todavía no.");
  if (ctx.cyclical) notes.push("Negocio cíclico: el consenso del próximo año puede estar en pico o valle de ciclo.");

  const summary = !isNum(mos)
    ? "Sin estimaciones ni plataformas suficientes para un Fair Value fiable."
    : mos >= 25
      ? `Cotiza ${fmtPct(mos, 0)} por debajo del Fair Value: oportunidad según el método.`
      : mos >= 15
        ? `Descuento de ${fmtPct(mos, 0)} frente al Fair Value: en zona de compra gradual.`
        : mos >= -10
          ? "Precio cerca del Fair Value: observar y esperar buy zone."
          : `Cotiza ${fmtPct(-mos, 0)} por encima del Fair Value: esperar mejor precio.`;

  const dcf = runDcf(a);
  return {
    key: "valuation",
    title: "Valuation",
    score,
    verdict,
    summary,
    items,
    notes,
    price,
    intrinsic: { dcf: isNum(dcf.perShare) && dcf.perShare > 0 ? dcf.perShare : null, historicalPe: null, historicalPeMultiple: null, pegFair: modelValue, graham: null, blended },
    marginOfSafety: mos,
    forward: { epsThisYear, epsNextYear, revenueThisYear, revenueNextYear, epsGrowthThisYear, epsGrowthNextYear, revGrowthThisYear, revGrowthNextYear, growthUsed, growthSource: eg.fuente, fairPe, modelValue, targetMean: an?.targetMean ?? null, targetHigh: an?.targetHigh ?? null, targetLow: an?.targetLow ?? null, analystCount: an?.count ?? null, valueTrap },
    platforms,
    components: componentes,
    platformsFailed: ctx.platformsFailed ?? [],
    impliedGrowth: reverseDcf(price, a),
    growthInputs: { "EPS este año": epsGrowthThisYear, "EPS próximo año": epsGrowthNextYear, "Ingresos este año": revGrowthThisYear, "Ingresos próximo año": revGrowthNextYear },
    method: "utilidades",
    methodReason: "Modelo adelantado + mediana con plataformas",
    sales: null,
    book: null,
    // Supuestos editables en el cliente: solo EPS estimado y crecimiento. Dividendo y prima en 0
    // para que el P/E justo sea exactamente el crecimiento acotado, como en el método.
    lynch: { eps: isNum(epsNextYear) && epsNextYear > 0 ? epsNextYear : 0, epsSource: "forward", growth: growthUsed ?? 0, dividendYield: 0, qualityBonus: 0, fairPe: fairPe ?? 0, capPe: PE_MAX },
    impliedGrowthEarnings: isNum(forwardPe) ? forwardPe : null,
    assumptions: a,
    multiples: { pe, peAvg5y, forwardPe, peg: pegFwd, ps: m.ps, psAvg5y, pb: m.pb, evEbitda: m.evEbitda, pFcf, fcfYield, earningsYield, premiumVsHistory },
    buyZone: { strong: isNum(blended) ? blended * 0.75 : null, gradual: isNum(blended) ? blended * 0.85 : null, fair: blended },
  };
}
