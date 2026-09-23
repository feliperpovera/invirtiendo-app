import type { AnnualRow, QuarterRow, N } from "./types";
import { isNum, avg, stdev, cagr, safeDiv, pct, clamp } from "@/lib/format";

/** Fusiona filas anuales SEC (preferidas) con Yahoo (rellena huecos y años recientes). */
export function mergeAnnual(sec: AnnualRow[], yahoo: AnnualRow[]): AnnualRow[] {
  const byYear = new Map<number, AnnualRow>();
  for (const r of sec) byYear.set(r.fy, { ...r });
  for (const y of yahoo) {
    // Yahoo y SEC pueden diferir un mes en la fecha de cierre; alinear por año fiscal
    const key = byYear.has(y.fy) ? y.fy : [...byYear.keys()].find((k) => Math.abs(k - y.fy) === 1 && Math.abs(daysBetween(byYear.get(k)!.end, y.end)) < 45) ?? y.fy;
    const cur = byYear.get(key);
    if (!cur) {
      byYear.set(key, { ...y, fy: key });
      continue;
    }
    for (const k of Object.keys(y) as Array<keyof AnnualRow>) {
      if (k === "fy" || k === "end") continue;
      if (!isNum(cur[k]) && isNum(y[k])) (cur as unknown as Record<string, unknown>)[k] = y[k];
    }
  }
  return [...byYear.values()].sort((a, b) => a.fy - b.fy);
}

const daysBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000;

/**
 * Ajuste por splits. La SEC entrega acciones y EPS tal como se reportaron en
 * cada 10-K (los años viejos no se re-expresan). Un salto ≥1.8x en acciones
 * diluidas de un año a otro es un split (2:1, 4:1, 10:1, 20:1), no dilución:
 * se re-expresan los años anteriores para que la serie sea comparable.
 */
export function splitAdjust(rows: AnnualRow[], factoresConocidos: number[] = []): AnnualRow[] {
  const R = rows.map((r) => ({ ...r })).sort((a, b) => a.fy - b.fy);
  const aplicar = (i: number, factor: number) => {
    for (let j = 0; j < i; j++) {
      if (isNum(R[j].sharesDiluted)) R[j].sharesDiluted = (R[j].sharesDiluted as number) * factor;
      if (isNum(R[j].epsDiluted)) R[j].epsDiluted = (R[j].epsDiluted as number) / factor;
    }
  };
  for (let i = R.length - 1; i > 0; i--) {
    const cur = R[i].sharesDiluted;
    const prev = R[i - 1].sharesDiluted;
    if (!isNum(cur) || !isNum(prev) || prev <= 0 || cur <= 0) continue;
    const ratio = cur / prev;
    let factor = 1;
    if (ratio >= 1.8) factor = Math.round(ratio);
    else if (ratio <= 0.55) factor = 1 / Math.round(1 / ratio);
    if (factor === 1) continue;
    aplicar(i, factor);
  }
  // Los años viejos suelen llegar sin conteo de acciones (la SEC da 10 años de EPS pero
  // Yahoo solo 4 de filas completas), y entonces la regla de arriba no ve el split.
  // Alphabet mostraba un EPS de 49.16 en 2019 junto a 2.93 en 2020: el corte de 20:1 de
  // 2022 quedó aplicado en los años que el 10-K de 2022 re-expresó y en los otros no.
  // Con los ingresos estables, un salto así en el EPS solo puede ser un split.
  for (let i = R.length - 1; i > 0; i--) {
    const cur = R[i].epsDiluted, prev = R[i - 1].epsDiluted;
    if (!isNum(cur) || !isNum(prev) || cur <= 0 || prev <= 0) continue;
    const ratio = prev / cur;
    if (ratio < 1.8) continue;
    const rv = R[i].revenue, rp = R[i - 1].revenue;
    // Si los ingresos también dieron el salto, es un cambio de moneda o de entidad, no un split.
    if (isNum(rv) && isNum(rp) && rv > 0 && rp / rv > 1.8) continue;
    // NUNCA inventar un split: solo se aplica un factor que Yahoo reporte de verdad para
    // esta empresa. Una caída de utilidades también da un salto grande (ON Semiconductor
    // pasó de $3.63 a $0.29 por deterioros) y dividir la historia por 10 la destruye.
    if (!factoresConocidos.length) continue;
    const factor = factoresConocidos.reduce((mejor, f) => (Math.abs(f - ratio) < Math.abs(mejor - ratio) ? f : mejor), factoresConocidos[0]);
    if (!(factor >= 1.8) || Math.abs(factor - ratio) / ratio > 0.25) continue;
    aplicar(i, factor);
  }
  return R;
}

export interface Derived {
  rows: AnnualRow[];
  years: number;
  latest: AnnualRow | null;
  prev: AnnualRow | null;
  per: Array<{
    fy: number;
    grossMargin: N;
    opMargin: N;
    netMargin: N;
    roe: N;
    roic: N;
    fcfToNi: N;
    debtToNi: N;
    revenueGrowth: N;
    epsGrowth: N;
    niGrowth: N;
    sharesChange: N;
  }>;
  growth: {
    revenue3y: N;
    revenue5y: N;
    revenue10y: N;
    eps5y: N;
    eps10y: N;
    netIncome5y: N;
    fcf5y: N;
  };
  ttm: { revenue: N; netIncome: N; eps: N; fcf: N; fromQuarters: boolean };
  avg5: { grossMargin: N; opMargin: N; netMargin: N; roe: N; roic: N; fcfToNi: N };
  stability: { grossMarginStdev: N; niDrops20: number; negativeNiYears: number; yearsCounted: number; fcfNegativeYears: number };
  balance: { netCash: N; debtToEquity: N; currentRatio: N; interestCoverage: N; debtToNiYears: N; taxRate: N };
  capital: { sharesChange5yPct: N; buybacks5y: N; dividends5y: N; sbcToRevenue: N; sbcToFcf: N; shareholderYield: N; payoutOfFcf: N };
}

const last = <T>(xs: T[], n = 1): T[] => xs.slice(Math.max(0, xs.length - n));

export function derive(rows: AnnualRow[], quarterly: QuarterRow[]): Derived {
  const R = splitAdjust(rows.filter((r) => isNum(r.revenue) || isNum(r.netIncome)));
  const latest = R[R.length - 1] ?? null;
  const prev = R[R.length - 2] ?? null;

  const taxRate = (r: AnnualRow): number => {
    const t = safeDiv(r.taxExpense, r.pretaxIncome);
    return isNum(t) ? clamp(t, 0.1, 0.3) : 0.21;
  };
  const roicOf = (r: AnnualRow): N => {
    if (!isNum(r.operatingIncome)) return null;
    const nopat = r.operatingIncome * (1 - taxRate(r));
    const eq = r.equity ?? 0;
    const debt = r.totalDebt ?? 0;
    const cash = r.cash ?? 0;
    let ic = eq + debt - cash;
    if (isNum(r.totalAssets)) ic = Math.max(ic, 0.15 * r.totalAssets);
    if (!(ic > 0)) return null;
    return (nopat / ic) * 100;
  };
  const roeOf = (r: AnnualRow, p: AnnualRow | null): N => {
    if (!isNum(r.netIncome)) return null;
    const eqAvg = isNum(r.equity) && isNum(p?.equity) ? (r.equity + (p!.equity as number)) / 2 : (r.equity ?? null);
    if (!isNum(eqAvg) || eqAvg <= 0) return null;
    return (r.netIncome / eqAvg) * 100;
  };

  const per = R.map((r, i) => {
    const p = R[i - 1] ?? null;
    return {
      fy: r.fy,
      grossMargin: pct(r.grossProfit, r.revenue),
      opMargin: pct(r.operatingIncome, r.revenue),
      netMargin: pct(r.netIncome, r.revenue),
      roe: roeOf(r, p),
      roic: roicOf(r),
      fcfToNi: isNum(r.netIncome) && r.netIncome > 0 ? safeDiv(r.fcf, r.netIncome) : null,
      debtToNi: isNum(r.netIncome) && r.netIncome > 0 ? safeDiv(r.totalDebt, r.netIncome) : null,
      revenueGrowth: p && isNum(p.revenue) && p.revenue > 0 && isNum(r.revenue) ? ((r.revenue - p.revenue) / p.revenue) * 100 : null,
      epsGrowth: p && isNum(p.epsDiluted) && p.epsDiluted > 0 && isNum(r.epsDiluted) ? ((r.epsDiluted - p.epsDiluted) / p.epsDiluted) * 100 : null,
      niGrowth: p && isNum(p.netIncome) && p.netIncome > 0 && isNum(r.netIncome) ? ((r.netIncome - p.netIncome) / p.netIncome) * 100 : null,
      sharesChange: p && isNum(p.sharesDiluted) && p.sharesDiluted > 0 && isNum(r.sharesDiluted) ? ((r.sharesDiluted - p.sharesDiluted) / p.sharesDiluted) * 100 : null,
    };
  });

  const at = (n: number) => R[R.length - 1 - n] ?? null; // n años atrás
  const g = (f: (r: AnnualRow) => N, yrs: number): N => {
    const a = at(yrs);
    const b = latest;
    if (!a || !b) return null;
    return cagr(f(a), f(b), yrs);
  };

  // TTM desde trimestres si hay ≥4 y son más recientes que el último anual
  // Un trimestre con ingresos en 0 es un reporte incompleto, no un cero real: contamina el TTM
  const q = quarterly.filter((x) => (isNum(x.revenue) && x.revenue !== 0) || (isNum(x.netIncome) && x.netIncome !== 0)).sort((a, b) => a.end.localeCompare(b.end));
  const q4 = last(q, 4);
  const fromQuarters = q4.length === 4 && (!latest || q4[3].end > latest.end);
  const sum = (f: (x: QuarterRow) => N): N => {
    const v = q4.map(f);
    return v.every(isNum) ? (v as number[]).reduce((a, b) => a + b, 0) : null;
  };
  const ttm = fromQuarters
    ? { revenue: sum((x) => x.revenue), netIncome: sum((x) => x.netIncome), eps: sum((x) => x.epsDiluted), fcf: sum((x) => x.fcf), fromQuarters: true }
    : { revenue: latest?.revenue ?? null, netIncome: latest?.netIncome ?? null, eps: latest?.epsDiluted ?? null, fcf: latest?.fcf ?? null, fromQuarters: false };
  if (fromQuarters && !isNum(ttm.fcf)) ttm.fcf = latest?.fcf ?? null;

  const p5 = last(per, 5);
  const avg5 = {
    grossMargin: avg(p5.map((x) => x.grossMargin)),
    opMargin: avg(p5.map((x) => x.opMargin)),
    netMargin: avg(p5.map((x) => x.netMargin)),
    roe: avg(p5.map((x) => x.roe)),
    roic: avg(p5.map((x) => x.roic)),
    fcfToNi: avg(p5.map((x) => x.fcfToNi)),
  };

  const r7 = last(R, 7); // últimos 6 años de variación: "sin años caóticos" mira lo reciente
  let niDrops20 = 0;
  let negativeNiYears = 0;
  let fcfNegativeYears = 0;
  for (let i = 0; i < r7.length; i++) {
    const r = r7[i];
    if (isNum(r.netIncome) && r.netIncome < 0) negativeNiYears++;
    if (isNum(r.fcf) && r.fcf < 0) fcfNegativeYears++;
    const p = r7[i - 1];
    if (p && isNum(p.netIncome) && p.netIncome > 0 && isNum(r.netIncome) && (r.netIncome - p.netIncome) / p.netIncome < -0.2) niDrops20++;
  }

  const L = latest;
  const balance = {
    // Ambos datos, no uno: si el filer no etiqueta la deuda, tratarla como cero regala
    // la prima de "caja neta" a la empresa más apalancada de la lista (Oracle, D/E 3.0).
    netCash: L && isNum(L.cash) && isNum(L.totalDebt) ? (L.cash as number) - (L.totalDebt as number) : null,
    debtToEquity: L && isNum(L.equity) && L.equity > 0 ? safeDiv(L.totalDebt ?? 0, L.equity) : null,
    currentRatio: L ? safeDiv(L.currentAssets, L.currentLiabilities) : null,
    interestCoverage: L && isNum(L.interestExpense) && L.interestExpense > 0 ? safeDiv(L.operatingIncome, L.interestExpense) : L && isNum(L.operatingIncome) && L.operatingIncome > 0 ? 999 : null,
    debtToNiYears: L && isNum(ttm.netIncome) && ttm.netIncome > 0 ? safeDiv(L.totalDebt ?? 0, ttm.netIncome) : null,
    taxRate: L ? taxRate(L) : null,
  };

  const r5 = last(R, 6);
  const first5 = r5[0];
  const sumF = (f: (r: AnnualRow) => N) => {
    const v = last(R, 5).map(f).filter(isNum);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const buybacks5y = sumF((r) => r.buybacks);
  const dividends5y = sumF((r) => r.dividends);
  const fcf5y = sumF((r) => r.fcf);
  const mcapProxy = null; // se calcula fuera con el precio
  void mcapProxy;
  const capital = {
    sharesChange5yPct: L && first5 && first5 !== L && isNum(first5.sharesDiluted) && first5.sharesDiluted > 0 && isNum(L.sharesDiluted) ? ((L.sharesDiluted - first5.sharesDiluted) / first5.sharesDiluted) * 100 : null,
    buybacks5y,
    dividends5y,
    sbcToRevenue: L ? pct(L.sbc, L.revenue) : null,
    sbcToFcf: L && isNum(L.fcf) && L.fcf > 0 ? pct(L.sbc, L.fcf) : null,
    shareholderYield: null as N,
    payoutOfFcf: isNum(fcf5y) && fcf5y > 0 ? (((buybacks5y ?? 0) + (dividends5y ?? 0)) / fcf5y) * 100 : null,
  };

  return {
    rows: R,
    years: R.length,
    latest,
    prev,
    per,
    growth: {
      revenue3y: g((r) => r.revenue, 3),
      revenue5y: g((r) => r.revenue, 5),
      revenue10y: g((r) => r.revenue, Math.min(10, R.length - 1)),
      eps5y: g((r) => r.epsDiluted, 5),
      eps10y: g((r) => r.epsDiluted, Math.min(10, R.length - 1)),
      netIncome5y: g((r) => r.netIncome, 5),
      fcf5y: g((r) => r.fcf, 5),
    },
    ttm,
    avg5,
    stability: { grossMarginStdev: stdev(p5.map((x) => x.grossMargin)), niDrops20, negativeNiYears, yearsCounted: r7.length, fcfNegativeYears },
    balance,
    capital,
  };
}

/* ── Perfil de industria ─────────────────────────────────────────── */
export interface IndustryProfile {
  cyclical: boolean;
  moatHint: string;
  tailwind: "fuerte" | "moderado" | "neutral" | "en contra";
  baseDiscount: number; // %
  label: string;
}

const CYCLICAL = /memory|storage|computer hardware|auto|oil|gas|energy|mining|metal|steel|chemical|airline|homebuild|shipping|construction|machinery|materials|coal|aluminum|paper|lumber/i;
/** Memoria y discos: cíclicas de libro aunque el sector diga otra cosa */
const CYCLICAL_TICKERS = new Set(["MU", "SNDK", "WDC", "STX", "AMAT", "LRCX", "KLAC"]);
const NETWORK = /internet|social|media|interactive|marketplace|payment|exchange|platform/i;
const SWITCH = /software|cloud|it services|enterprise|database|cyber|security/i;
const BRAND = /beverage|consumer|apparel|restaurant|luxury|tobacco|household|cosmetic|footwear|food/i;
const PATENT = /pharma|biotech|medical|health|drug|life science/i;
const REG = /bank|insurance|utilit|telecom|financial services|capital markets|real estate|reit/i;
const TAIL_STRONG = /semiconductor|software|cloud|cyber|internet|payment|ai|data|medical device|biotech|electric|renewable|aerospace/i;
const TAIL_AGAINST = /tobacco|coal|print|newspaper|cable|department store|legacy|landline/i;

export function industryProfile(industry?: string, sector?: string, symbol?: string): IndustryProfile {
  const s = `${industry ?? ""} ${sector ?? ""}`;
  const cyclical = (CYCLICAL.test(s) && !SWITCH.test(s)) || (!!symbol && CYCLICAL_TICKERS.has(symbol.toUpperCase()));
  let moatHint = "Marca o escala: verifica que se vea en márgenes altos y estables.";
  if (NETWORK.test(s)) moatHint = "Efectos de red: cada usuario nuevo hace el producto más valioso (tipo META, V, MA).";
  else if (SWITCH.test(s)) moatHint = "Costos de cambio: al cliente le cuesta irse; ingresos recurrentes (tipo MSFT, ORCL).";
  else if (/semiconductor|equipment/i.test(s)) moatHint = "Liderazgo técnico y escala: I+D y capex que pocos pueden igualar (tipo NVDA, ASML, TSM).";
  else if (BRAND.test(s)) moatHint = "Marca con poder de precios: sube precios sin perder volumen (tipo KO, COST, LVMH).";
  else if (PATENT.test(s)) moatHint = "Patentes y regulación: protección temporal; vigila vencimientos (tipo LLY, NVO).";
  else if (REG.test(s)) moatHint = "Escala regulada y costos de cambio: barreras legales y confianza (tipo JPM, BRK).";
  else if (/retail|discount|wholesale/i.test(s)) moatHint = "Escala y costos bajos: el más barato para el cliente gana (tipo COST, WMT, AMZN).";

  const tailwind: IndustryProfile["tailwind"] = TAIL_AGAINST.test(s) ? "en contra" : TAIL_STRONG.test(s) ? "fuerte" : cyclical ? "neutral" : "moderado";
  const baseDiscount = cyclical ? 11 : REG.test(s) ? 10 : 9.0;
  return { cyclical, moatHint, tailwind, baseDiscount, label: industry || sector || "Sin clasificar" };
}
