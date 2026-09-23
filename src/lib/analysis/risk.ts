import type { RiskResult, CheckItem, Metrics, PriceHistory, EarningsCalendar, N, Quote, PricePoint } from "./types";
import type { Derived, IndustryProfile } from "./fundamentals";
import { isNum, fmtPct, fmtX, clamp } from "@/lib/format";

function dailyReturns(pts: PricePoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < pts.length; i++) if (pts[i - 1].c > 0) out.push(pts[i].c / pts[i - 1].c - 1);
  return out;
}

export function annualizedVol(pts: PricePoint[]): N {
  const r = dailyReturns(pts.slice(-252));
  if (r.length < 60) return null;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const v = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  return v * Math.sqrt(252) * 100;
}

export function maxDrawdown(pts: PricePoint[]): N {
  if (pts.length < 10) return null;
  let peak = pts[0].c;
  let mdd = 0;
  for (const p of pts) {
    if (p.c > peak) peak = p.c;
    const dd = (p.c - peak) / peak;
    if (dd < mdd) mdd = dd;
  }
  return mdd * 100;
}

/** Beta frente al S&P 500 con retornos diarios alineados por fecha. */
export function betaVs(stock: PricePoint[], index: PricePoint[]): N {
  const idx = new Map(index.map((p) => [new Date(p.t).toISOString().slice(0, 10), p.c]));
  const pairs: Array<[number, number]> = [];
  let prevS: number | null = null;
  let prevI: number | null = null;
  for (const p of stock.slice(-260)) {
    const key = new Date(p.t).toISOString().slice(0, 10);
    const ic = idx.get(key);
    if (!isNum(ic)) continue;
    if (prevS !== null && prevI !== null) pairs.push([p.c / prevS - 1, ic / prevI - 1]);
    prevS = p.c;
    prevI = ic;
  }
  if (pairs.length < 60) return null;
  const ms = pairs.reduce((a, [s]) => a + s, 0) / pairs.length;
  const mi = pairs.reduce((a, [, i]) => a + i, 0) / pairs.length;
  let cov = 0;
  let vi = 0;
  for (const [s, i] of pairs) {
    cov += (s - ms) * (i - mi);
    vi += (i - mi) ** 2;
  }
  return vi > 0 ? cov / vi : null;
}

export function riskPillar(
  quote: Quote,
  d: Derived,
  m: Metrics,
  history: PriceHistory,
  cal: EarningsCalendar | null,
  ind: IndustryProfile,
  qualityPass: number,
  spx: PricePoint[] | null,
): RiskResult {
  const beta = isNum(m.beta) ? m.beta : spx ? betaVs(history.daily, spx) : null;
  const vol = annualizedVol(history.daily);
  const mdd = maxDrawdown(history.weekly.length ? history.weekly : history.monthly);
  const high52 = quote.high52 ?? m.high52;
  const fromHigh = isNum(high52) && high52 > 0 ? (quote.price / high52 - 1) * 100 : null;
  const de = isNum(m.debtToEquity) ? (m.debtToEquity > 5 ? m.debtToEquity / 100 : m.debtToEquity) : d.balance.debtToEquity; // Finnhub a veces lo da en %
  const cov = isNum(m.interestCoverage) ? m.interestCoverage : d.balance.interestCoverage;
  const cr = isNum(m.currentRatio) ? m.currentRatio : d.balance.currentRatio;
  const mcap = m.marketCap;
  const ni = d.ttm.netIncome;
  const ps = m.ps;
  const pe = m.pe;
  const daysUntil = cal?.daysUntil ?? null;
  const eventWarn = isNum(daysUntil) && daysUntil >= 0 && daysUntil <= 10;

  const items: CheckItem[] = [
    { key: "beta", label: "Beta (sensibilidad al mercado)", value: isNum(beta) ? beta.toFixed(2) : "—", pass: isNum(beta) ? beta <= 1.3 : null, detail: ">1.5 se mueve mucho más que el índice" },
    { key: "vol", label: "Volatilidad anualizada 1 año", value: fmtPct(vol, 0), pass: isNum(vol) ? vol <= 35 : null, detail: "S&P 500 ≈ 15-20%" },
    { key: "mdd", label: "Máxima caída 5 años", value: fmtPct(mdd, 0), pass: isNum(mdd) ? mdd >= -50 : null, detail: "¿Aguantarías esa caída sin vender?" },
    { key: "high", label: "Distancia al máximo de 52 semanas", value: fmtPct(fromHigh, 0, true), pass: null, detail: "Cerca del máximo = riesgo de perseguir; −20% o más = revisa por qué" },
    { key: "de", label: "Deuda / patrimonio", value: isNum(de) ? fmtX(de, 2) : "—", pass: isNum(de) ? de <= 1 : null },
    { key: "cov", label: "Cobertura de intereses (EBIT / intereses)", value: isNum(cov) ? (cov >= 999 ? "sin deuda relevante" : fmtX(cov, 1)) : "—", pass: isNum(cov) ? cov >= 6 : null, detail: "<3x: frágil ante tasas altas" },
    { key: "cr", label: "Liquidez (activo / pasivo corriente)", value: fmtX(cr, 2), pass: isNum(cr) ? cr >= 1 : null },
    { key: "size", label: "Tamaño", value: isNum(mcap) ? (mcap >= 200e9 ? "Mega-cap" : mcap >= 10e9 ? "Large-cap" : mcap >= 2e9 ? "Mid-cap" : "Small-cap") : "—", pass: isNum(mcap) ? mcap >= 10e9 : null },
    { key: "profit", label: "Rentable (evita especulación)", value: isNum(ni) ? (ni > 0 ? "Sí" : "No") : "—", pass: isNum(ni) ? ni > 0 : null, weight: 2 },
    { key: "val", label: "Riesgo de valoración (P/S > 15 o P/E > 60)", value: `P/S ${fmtX(ps)} · P/E ${fmtX(pe)}`, pass: isNum(ps) || isNum(pe) ? !((isNum(ps) && ps > 15) || (isNum(pe) && pe > 60)) : null },
    { key: "cycle", label: "Cíclica", value: ind.cyclical ? "Sí" : "No", pass: !ind.cyclical, detail: ind.cyclical ? "Múltiplos bajos en la cima del ciclo engañan; mitad del tamaño normal" : undefined },
    { key: "short", label: "Interés en corto (% del flotante)", value: fmtPct(m.shortPctFloat, 1), pass: isNum(m.shortPctFloat) ? m.shortPctFloat < 10 : null, detail: ">10% = muchos apuestan en contra; >20% riesgo de movimientos violentos" },
    { key: "event", label: "Riesgo de evento (earnings en ≤ 10 días)", value: isNum(daysUntil) ? (daysUntil < 0 ? "Sin fecha próxima" : `en ${daysUntil} días${cal?.nextDate ? ` (${cal.nextDate})` : ""}`) : "Sin dato (requiere Finnhub)", pass: isNum(daysUntil) ? !eventWarn : null, detail: "Regla: no ampliar justo antes del evento; comprar la reacción si la guía es sólida" },
  ];

  const known = items.filter((i) => i.pass !== null);
  const tot = known.reduce((s, i) => s + (i.weight ?? 1), 0);
  const got = known.reduce((s, i) => s + (i.pass ? (i.weight ?? 1) : 0), 0);
  let score = tot ? Math.round((got / tot) * 100) : 50;
  if (isNum(ni) && ni <= 0) score = Math.min(score, 35);
  if (ind.cyclical || (isNum(beta) && beta > 1.8)) score = Math.min(score, 62); // nunca "riesgo bajo" para cíclicas o betas extremas
  if (isNum(vol) && vol > 45) score = Math.min(score, 55);
  if (isNum(mdd) && mdd < -60) score = Math.min(score, 60);
  score = clamp(score, 0, 100);
  const level: RiskResult["level"] = score >= 75 ? "Bajo" : score >= 55 ? "Medio" : score >= 35 ? "Alto" : "Especulativo";
  const profile: RiskResult["profile"] = isNum(mcap) && mcap >= 150e9 && qualityPass >= 4 && !ind.cyclical && level !== "Alto" && level !== "Especulativo" ? "nucleo" : "satelite";
  const verdict = level === "Bajo" ? "PASA" : level === "Medio" ? "DUDOSO" : "FALLA";
  const notes: string[] = [];
  if (eventWarn) notes.push(`Earnings en ${daysUntil} días: no ampliar antes del evento. Compra la reacción si la guía es sólida.`);
  if (ind.cyclical) notes.push("Cíclica: diversifica catalizadores, no acumules tres del mismo ciclo a la vez.");
  if (profile === "satelite") notes.push("Perfil satélite: máximo 3-4% del portafolio por posición; entrada inicial pequeña (25-33% del objetivo).");
  return {
    key: "risk",
    title: "Risk",
    score,
    verdict,
    summary: `Riesgo ${level.toLowerCase()} · perfil ${profile === "nucleo" ? "núcleo" : "satélite"}.`,
    items,
    notes,
    level,
    beta,
    volatility1y: vol,
    maxDrawdown5y: mdd,
    fromHigh52: fromHigh,
    eventRisk: { nextEarnings: cal?.nextDate ?? null, daysUntil, warn: eventWarn },
    cyclical: ind.cyclical,
    profile,
  };
}
