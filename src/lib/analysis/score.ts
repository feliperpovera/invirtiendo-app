import type { ScoreResult, PlanResult, PillarResult, ValuationResult, RiskResult, SentimentResult, BuffettResult, SignalKey, Profile, PeersResult, Metrics } from "./types";
import type { IndustryProfile, Derived } from "./fundamentals";
import { isNum, clamp, fmtPct, fmtMoney } from "@/lib/format";
import { DISPERSION_MAX, fuentesDeAcuerdo } from "./forward";

/** Pesos del componente de datos (suman 100) */
const DATA_W = { quality: 22, growth: 16, valuation: 26, balance: 10, risk: 14, sentiment: 12 } as const;
/** Pesos de los tres componentes */
const MIX = { data: 70, buffett: 30 } as const;

export function signalFor(mos: number | null, failedCore: boolean, fiable = true): ScoreResult["signal"] {
  void failedCore; // el fallo Buffett se muestra como advertencia, no anula la señal de precio
  if (!isNum(mos)) return { key: "watch", label: "Sin Fair Value", text: "No hay utilidad estimada positiva para el próximo año: sin eso este método no valora. Watch." };
  if (!fiable && mos >= 15)
    return { key: "watch", label: "Watch", text: `Las fuentes del Fair Value se contradicen en más de ${DISPERSION_MAX}%: el descuento no es fiable como para comprar. Watch hasta que coincidan.` };
  // Un descuento de 80%+ casi siempre es un dato roto (EPS atípico, acción de centavos), no una ganga.
  if (mos >= 80) return { key: "watch", label: "Watch", text: "Descuento extremo frente al Fair Value (80%+): casi siempre es un dato atípico. Revisar a mano antes de comprar." };
  if (mos >= 25) return { key: "strong", label: "Strong Buy", text: "Margin of Safety ≥ 25%: comprar por tramos con decisión." };
  if (mos >= 15) return { key: "good", label: "Buy Zone", text: "Margin of Safety ≥ 15%: en zona de compra. Entrar por tramos." };
  if (mos >= -10) return { key: "watch", label: "Watch", text: "Precio cerca del Fair Value (±10%): watchlist con precio objetivo." };
  if (mos >= -30) return { key: "wait", label: "Wait", text: "Cotiza por encima del Fair Value: no perseguir, siempre hay otra oportunidad." };
  return { key: "avoid", label: "Avoid", text: "Muy por encima del Fair Value: el mercado ya descuenta lo mejor." };
}

/** Score de crecimiento puramente numérico (ingresos, utilidades, estimaciones). */
function growthScore(d: Derived, m: Metrics): number | null {
  const parts: Array<[number | null, number]> = [
    [d.growth.revenue5y, 1],
    [d.growth.revenue3y, 1.5],
    [m.revenueGrowthTTM, 1],
    [m.epsGrowth5Y ?? d.growth.eps5y, 1],
    [m.growthEstimate, 1.5],
  ];
  const avail = parts.filter(([v]) => isNum(v)) as Array<[number, number]>;
  if (!avail.length) return null;
  // Mapea % de crecimiento → 0-100: 0% → 30 · 10% → 60 · 20% → 80 · ≥35% → 100 · negativo → <30
  const map = (g: number) => clamp(g <= 0 ? 30 + g * 1.5 : g <= 10 ? 30 + g * 3 : g <= 20 ? 60 + (g - 10) * 2 : g <= 35 ? 80 + (g - 20) * 1.33 : 100, 0, 100);
  const w = avail.reduce((s, [, x]) => s + x, 0);
  return Math.round(avail.reduce((s, [g, x]) => s + map(g) * x, 0) / w);
}

/** Score de balance: caja neta, deuda/patrimonio, cobertura, liquidez. */
function balanceScore(d: Derived, m: Metrics): number | null {
  const de = isNum(m.debtToEquity) ? (m.debtToEquity > 5 ? m.debtToEquity / 100 : m.debtToEquity) : d.balance.debtToEquity;
  const parts: number[] = [];
  if (isNum(d.balance.netCash)) parts.push(d.balance.netCash >= 0 ? 100 : isNum(d.balance.debtToNiYears) ? clamp(100 - d.balance.debtToNiYears * 20, 0, 100) : 50);
  if (isNum(de)) parts.push(clamp(100 - de * 60, 0, 100));
  const cov = isNum(m.interestCoverage) ? m.interestCoverage : d.balance.interestCoverage;
  if (isNum(cov)) parts.push(clamp(cov * 8, 0, 100));
  const cr = isNum(m.currentRatio) ? m.currentRatio : d.balance.currentRatio;
  if (isNum(cr)) parts.push(clamp((cr - 0.5) * 60, 0, 100));
  return parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
}

/** Valoración por datos: mezcla Margin of Safety, PEG, FCF yield, P/E vs historia y vs pares. */
function valuationDataScore(v: ValuationResult, peers: PeersResult): number | null {
  const parts: Array<[number | null, number]> = [];
  const mos = v.marginOfSafety;
  if (isNum(mos)) parts.push([clamp(60 + mos * 1.3, 0, 100), 3]);
  if (isNum(v.multiples.peg) && v.multiples.peg > 0) parts.push([clamp(110 - v.multiples.peg * 45, 0, 100), 2]);
  if (isNum(v.multiples.fcfYield)) parts.push([clamp(v.multiples.fcfYield * 15, 0, 100), 1]);
  if (isNum(v.multiples.premiumVsHistory)) parts.push([clamp(60 - v.multiples.premiumVsHistory * 0.8, 0, 100), 1.5]);
  if (isNum(peers.relative.forwardPeVsPeers)) parts.push([clamp(60 - peers.relative.forwardPeVsPeers * 0.8, 0, 100), 1.5]);
  if (!parts.length) return null;
  const w = parts.reduce((s, [, x]) => s + x, 0);
  return Math.round(parts.reduce((s, [p, x]) => s + (p as number) * x, 0) / w);
}

export function buildScore(
  p: { moat: PillarResult; quality: PillarResult; management: PillarResult; durability: PillarResult },
  valuation: ValuationResult,
  risk: RiskResult,
  sentiment: SentimentResult,
  peers: PeersResult,
  buffett: BuffettResult,
  d: Derived,
  m: Metrics,
): ScoreResult {
  // Calidad por datos: promedio de moat (márgenes, ROIC) y números (5 umbrales)
  const qualityData = isNum(p.moat.score) && isNum(p.quality.score) ? Math.round((p.moat.score + p.quality.score) / 2) : (p.quality.score ?? p.moat.score);
  const pillars = [
    { key: "quality", title: "Quality", score: qualityData, weight: DATA_W.quality },
    { key: "growth", title: "Growth", score: growthScore(d, m), weight: DATA_W.growth },
    { key: "valuation", title: "Valuation", score: valuationDataScore(valuation, peers), weight: DATA_W.valuation },
    { key: "balance", title: "Balance", score: balanceScore(d, m), weight: DATA_W.balance },
    { key: "risk", title: "Risk", score: risk.score, weight: DATA_W.risk },
    { key: "sentiment", title: "Sentiment", score: sentiment.score, weight: DATA_W.sentiment },
  ];
  const avail = pillars.filter((x) => isNum(x.score));
  const wsum = avail.reduce((s, x) => s + x.weight, 0);
  const data = wsum ? Math.round(avail.reduce((s, x) => s + (x.score as number) * x.weight, 0) / wsum) : null;

  // Pilares: fracción de los seis que cumplen (todos medidos con datos)
  const bf = buffett.filters.filter((f) => f.n <= 6);
  const bScore = Math.round((bf.reduce((s, f) => s + (f.verdict === "PASA" ? 1 : 0), 0) / bf.length) * 100);

  const comps: Array<[number | null, number]> = [
    [data, MIX.data],
    [bScore, MIX.buffett],
  ];
  const ca = comps.filter(([v]) => isNum(v)) as Array<[number, number]>;
  const cw = ca.reduce((s, [, w]) => s + w, 0);
  let total = cw ? Math.round(ca.reduce((s, [v, w]) => s + v * w, 0) / cw) : 0;
  total = clamp(total, 0, 100);
  const grade: ScoreResult["grade"] = total >= 80 ? "A" : total >= 68 ? "B" : total >= 55 ? "C" : total >= 40 ? "D" : "F";
  return {
    total,
    grade,
    components: { data, lynch: null, buffett: bScore, weights: { ...MIX, lynch: 0 } },
    pillars,
    signal: signalFor(valuation.marginOfSafety, buffett.failedCore, fuentesDeAcuerdo(valuation.components, valuation.intrinsic.blended)),
  };
}

export function buildPlan(
  price: number,
  valuation: ValuationResult,
  risk: RiskResult,
  signal: SignalKey,
  d: Derived,
  profile: Profile,
  ind: IndustryProfile,
  moatHint: string,
  failedCore = false,
): PlanResult {
  const prof = risk.profile;
  let maxWeight = prof === "nucleo" ? 8 : 3;
  if (failedCore) maxWeight = Math.min(maxWeight, 3); // falla Buffett → nunca núcleo
  if (ind.cyclical || (isNum(valuation.marginOfSafety) && valuation.marginOfSafety > 40)) maxWeight = Math.max(1.5, maxWeight / 2);
  const z = valuation.buyZone;
  const round = (x: number | null) => (isNum(x) ? Math.round(x * 100) / 100 : null);

  let tranches: PlanResult["tranches"];
  if (signal === "strong") {
    tranches = [
      { n: 1, label: "Ahora (precio actual)", price: round(price), sharePct: 34 },
      { n: 2, label: "Si cae 5-7%", price: round(price * 0.94), sharePct: 33 },
      { n: 3, label: "Si cae 12-15%", price: round(price * 0.87), sharePct: 33 },
    ];
  } else if (signal === "good") {
    tranches = [
      { n: 1, label: "Entrada inicial pequeña (ahora)", price: round(price), sharePct: 25 },
      { n: 2, label: "Strong Buy (25% bajo Fair Value)", price: round(z.strong), sharePct: 35 },
      { n: 3, label: "Si cae 12-15% desde hoy", price: round(price * 0.87), sharePct: 40 },
    ];
  } else if (signal === "watch" || signal === "wait") {
    tranches = [
      { n: 1, label: "No comprar hoy · activar en Buy Zone (15% bajo Fair Value)", price: round(z.gradual), sharePct: 40 },
      { n: 2, label: "Strong Buy (25% bajo Fair Value)", price: round(z.strong), sharePct: 60 },
    ];
  } else {
    tranches = [{ n: 1, label: "Sin plan de compra: el proceso dice no", price: null, sharePct: 0 }];
  }

  const g = d.growth.revenue5y;
  const nm = d.per.at(-1)?.netMargin ?? null;
  const why = `${profile.name} (${ind.label}) crece ingresos ${isNum(g) ? fmtPct(g, 0) + " anual (5a)" : "—"} con margen neto ${fmtPct(nm, 0)} y ${isNum(d.balance.netCash) && d.balance.netCash >= 0 ? "caja neta" : "deuda manejable"}; el mercado la valora en ${fmtMoney(price)} vs Fair Value ${isNum(z.fair) ? fmtMoney(z.fair) : "—"}.`;
  const breaker = [
    "falla su guía 2 trimestres seguidos",
    "el catalizador de la tesis desaparece",
    "la deuda crece más rápido que el negocio",
    ind.cyclical ? "los precios del producto se dan vuelta (ciclo)" : "un competidor erosiona el margen bruto",
  ].join(" · ");
  const rules = [
    "Órdenes límite, nunca de mercado.",
    "No ampliar justo antes de earnings o Fed: comprar la reacción si la guía es sólida.",
    "Si el precio se escapa hacia arriba, no perseguir (nada que subió >20% en un mes).",
    `Tamaño máximo sugerido: ${maxWeight}% del portafolio (${prof === "nucleo" ? "núcleo" : "satélite"}${ind.cyclical ? ", cíclica: mitad del tamaño normal" : ""}).`,
    "Máximo 1-2 decisiones por semana. Si dudas del tamaño, es que es muy grande.",
  ];
  return { profile: prof, maxWeightPct: maxWeight, tranches, thesisTemplate: { why, moat: moatHint, breaker }, rules };
}
