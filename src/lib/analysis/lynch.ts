import type { PillarResult, CheckItem, Metrics, N, Verdict, InsiderView } from "./types";
import type { Derived, IndustryProfile } from "./fundamentals";
import { isNum, fmtPct, fmtX, fmtMoney, clamp } from "@/lib/format";
import { expectedGrowth, fairPe as lynchFairPe } from "./growth";

export type LynchCategory = "Fast Grower" | "Stalwart" | "Slow Grower" | "Cyclical" | "Turnaround" | "Asset Play";

export interface LynchResult extends PillarResult {
  category: LynchCategory;
  categoryNote: string;
  peg: N;
  pegAdjusted: N; // (growth + dividend yield) / P/E  → Lynch: >2 excelente, 1.5 bueno, <1 pobre
  growthUsed: N;
  fairValue: N; // EPS × growth (P/E = growth), acotado 8-25x como Lynch sugería para no pagar de más
  fairPe: N;
}

/** Peter Lynch: "Buy what you know", PEG, categorías y reglas de balance. */
export function lynchPillar(d: Derived, m: Metrics, price: number, ind: IndustryProfile, insiders: InsiderView | null): LynchResult {
  const eps = isNum(m.epsTTM) ? m.epsTTM : d.ttm.eps;
  const pe = isNum(m.pe) && m.pe > 0 ? m.pe : isNum(eps) && eps > 0 ? price / eps : null;
  const growth = expectedGrowth(d, m, { cyclical: ind.cyclical }).g;
  const yieldPct = isNum(m.dividendYield) ? m.dividendYield : 0;
  const peUse = isNum(m.forwardPe) && m.forwardPe > 0 ? m.forwardPe : pe;
  const peg = isNum(peUse) && isNum(growth) && growth > 0 ? peUse / growth : null;
  const pegAdjusted = isNum(peUse) && isNum(growth) && peUse > 0 ? (growth + yieldPct) / peUse : null;
  const fairPe = lynchFairPe(growth, m.dividendYield, { roic: m.roic ?? d.avg5.roic, gmStdev: d.stability.grossMarginStdev, netCash: d.balance.netCash, debtToEquity: m.debtToEquity });
  let epsF = isNum(m.epsForward) && m.epsForward > 0 ? m.epsForward : eps;
  let fairPeUsed = fairPe;
  if (ind.cyclical) {
    const hist = d.rows.slice(-5).map((r) => r.epsDiluted).filter((x): x is number => isNum(x) && x > 0);
    const media = hist.length >= 3 ? hist.reduce((a, b) => a + b, 0) / hist.length : null;
    const techo = isNum(eps) && eps > 0 ? Math.max(eps, media ?? 0) : (media ?? epsF);
    if (isNum(techo) && techo > 0) epsF = isNum(epsF) ? Math.min(epsF, techo) : techo;
    if (isNum(fairPeUsed)) fairPeUsed = Math.min(fairPeUsed, 14);
  }
  const fairValue = isNum(epsF) && epsF > 0 && isNum(fairPeUsed) ? epsF * fairPeUsed : null;

  // Categoría Lynch
  const ni = d.ttm.netIncome;
  const mcap = m.marketCap;
  const pb = m.pb;
  let category: LynchCategory;
  let categoryNote: string;
  if (isNum(ni) && ni <= 0 && isNum(d.growth.revenue3y) && d.growth.revenue3y > 0) {
    category = "Turnaround";
    categoryNote = "Pierde dinero pero el negocio se mueve: solo con balance sólido y catalizador claro. Tamaño pequeño.";
  } else if (isNum(pb) && pb < 1 && isNum(ni) && ni > 0) {
    category = "Asset Play";
    categoryNote = "Cotiza por debajo del valor en libros: el valor está en los activos, no en el crecimiento.";
  } else if (ind.cyclical) {
    category = "Cyclical";
    categoryNote = "El timing lo es todo: un P/E bajo cerca del pico de ciclo es una trampa, no una oportunidad.";
  } else if (isNum(growth) && growth >= 20) {
    category = "Fast Grower";
    categoryNote = "Crece >20%: el PEG es la métrica reina. Vigila que el crecimiento no se frene y que no se endeude para crecer.";
  } else if (isNum(growth) && growth >= 10) {
    category = "Stalwart";
    categoryNote = isNum(mcap) && mcap > 100e9 ? "Gigante que crece 10-20%: espera 30-50% en 2 años, no un ten-bagger. Compra cuando el P/E cae bajo su historia." : "Crece 10-20% con estabilidad: buena protección en recesiones.";
  } else {
    category = "Slow Grower";
    categoryNote = "Crece menos de 10%: se compra por dividendo y precio, no por crecimiento. Exige yield y balance impecable.";
  }

  const de = isNum(m.debtToEquity) ? (m.debtToEquity > 5 ? m.debtToEquity / 100 : m.debtToEquity) : d.balance.debtToEquity;
  const shares5 = d.capital.sharesChange5yPct;
  const inst = m.institutionsPct;
  const items: CheckItem[] = [
    { key: "peg", label: "PEG (P/E ÷ crecimiento de utilidades)", value: isNum(peg) && peg > 0 && peg < 10 ? peg.toFixed(2) : "n.s.", pass: isNum(peg) ? peg <= 1.0 : null, detail: "Lynch: <0.5 muy atractivo · 1.0 justo · >2.0 caro", weight: 3 },
    { key: "pegadj", label: "PEG ajustado por dividendo: (crecimiento + yield) ÷ P/E", value: isNum(pegAdjusted) ? pegAdjusted.toFixed(2) : "—", pass: isNum(pegAdjusted) ? pegAdjusted >= 1.5 : null, detail: "≥ 2 excelente · 1.5 aceptable · < 1 pobre", weight: 2 },
    { key: "fair", label: "Precio vs Fair Value Lynch (EPS × crecimiento)", value: isNum(fairValue) ? `${fmtMoney(fairValue)} (${fmtPct(((fairValue - price) / price) * 100, 0, true)})` : "—", pass: isNum(fairValue) ? fairValue >= price : null, detail: `P/E justo = crecimiento + dividendo (${fmtX(fairPe, 0)}), acotado a 10-30x`, weight: 2 },
    { key: "growthq", label: "Crecimiento de utilidades sostenible (10-25% ideal)", value: fmtPct(growth, 1), pass: isNum(growth) ? growth >= 10 && growth <= 50 : null, detail: ">50% rara vez se sostiene; <10% no es fast grower" },
    { key: "de", label: "Deuda / patrimonio bajo (< 0.35 ideal, < 0.8 aceptable)", value: isNum(de) ? fmtX(de, 2) : "—", pass: isNum(de) ? de < 0.8 : null, detail: "Lynch huía de balances cargados: la deuda mata turnarounds", weight: 2 },
    { key: "cash", label: "Caja neta positiva", value: isNum(d.balance.netCash) ? (d.balance.netCash >= 0 ? "Sí" : "No") : "—", pass: isNum(d.balance.netCash) ? d.balance.netCash >= 0 : null },
    { key: "buyback", label: "Recompra acciones (dilución negativa 5 años)", value: fmtPct(shares5, 1, true), pass: isNum(shares5) ? shares5 < 0 : null, detail: "Lynch: la recompra es la forma más simple de premiar al accionista" },
    { key: "insiders", label: "Insiders compran", value: insiders ? `${insiders.buys} compras / ${insiders.sells} ventas` : "—", pass: insiders && insiders.buys > insiders.sells ? true : null, detail: "Venden por mil razones, compran por una sola: solo la compra neta cuenta" },
    { key: "inst", label: "Propiedad institucional < 70%", value: fmtPct(inst, 0), pass: isNum(inst) ? inst < 70 : null, detail: "Lo que Wall Street ya tiene, ya está en el precio" },
    { key: "story", label: "¿Puedes contar la historia en 2 minutos y explicar por qué crecerá?", value: "Tú decides", pass: null, detail: "Buy what you know: si no entiendes la historia, no es tuya" },
  ];
  const known = items.filter((i) => i.pass !== null);
  const tot = known.reduce((s, i) => s + (i.weight ?? 1), 0);
  const got = known.reduce((s, i) => s + (i.pass ? (i.weight ?? 1) : 0), 0);
  let score = tot ? Math.round((got / tot) * 100) : null;
  if (isNum(score) && isNum(peg)) score = clamp(score + (peg < 0.5 ? 8 : peg > 2 ? -10 : 0), 0, 100);
  const verdict: Verdict = !isNum(score) ? "DUDOSO" : score >= 65 ? "PASA" : score >= 45 ? "DUDOSO" : "FALLA";
  const summary = `${category}. ${isNum(peg) ? `PEG ${peg.toFixed(2)}` : "Sin PEG (sin utilidades)"}${isNum(fairValue) ? ` · Fair Value Lynch ${fmtMoney(fairValue)}` : ""}.`;
  return {
    key: "lynch",
    title: "Lynch",
    score,
    verdict,
    summary,
    items,
    notes: [categoryNote, "Lynch: el precio sigue a las utilidades. Con PEG < 1 y balance sano, el tiempo juega a tu favor; con PEG > 2 juegas contra el reloj."],
    category,
    categoryNote,
    peg,
    pegAdjusted,
    growthUsed: growth,
    fairValue,
    fairPe: fairPeUsed,
  };
}
