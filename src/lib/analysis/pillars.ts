import type { PillarResult, CheckItem, Metrics, Profile, N, InsiderView, EarningsSurprise, PriceHistory, Verdict } from "./types";
import type { Derived, IndustryProfile } from "./fundamentals";
import { isNum, fmtPct, fmtBig, fmtX, clamp } from "@/lib/format";

const scoreFrom = (items: CheckItem[]): N => {
  const w = items.filter((i) => i.pass !== null);
  if (!w.length) return null;
  const tot = w.reduce((s, i) => s + (i.weight ?? 1), 0);
  const got = w.reduce((s, i) => s + (i.pass ? (i.weight ?? 1) : 0), 0);
  return Math.round((got / tot) * 100);
};

const pick = (...xs: N[]): N => xs.find(isNum) ?? null;

/* ── Filtro 1 · Círculo de competencia ───────────────────────────── */
export function businessPillar(d: Derived, m: Metrics, profile: Profile, ind: IndustryProfile): PillarResult {
  const rev = pick(d.ttm.revenue, d.latest?.revenue ?? null);
  const ni = pick(d.ttm.netIncome, d.latest?.netIncome ?? null);
  const items: CheckItem[] = [
    { key: "profit", label: "Gana dinero hoy (utilidad neta positiva)", value: fmtBig(ni), pass: isNum(ni) ? ni > 0 : null, detail: "Buffett no compra promesas: exige utilidades reales", weight: 2 },
    { key: "scale", label: "Escala probada (ingresos > $1B)", value: fmtBig(rev), pass: isNum(rev) ? rev > 1e9 : null },
    { key: "history", label: "Historia pública suficiente (≥ 5 años de estados financieros)", value: `${d.years} años`, pass: d.years >= 5 },
    { key: "growth", label: "El negocio crece (ingresos TTM)", value: fmtPct(pick(m.revenueGrowthTTM, d.per.at(-1)?.revenueGrowth ?? null), 1, true), pass: isNum(pick(m.revenueGrowthTTM, d.per.at(-1)?.revenueGrowth ?? null)) ? (pick(m.revenueGrowthTTM, d.per.at(-1)?.revenueGrowth ?? null) as number) > 0 : null },
    { key: "q1", label: "¿Qué vende? — explícalo en una frase", value: "Tú decides", pass: null, detail: "Cualitativo: márcalo en la lista de verificación" },
    { key: "q2", label: "¿Cómo gana dinero?", value: "Tú decides", pass: null },
    { key: "q3", label: "¿Quién le paga?", value: "Tú decides", pass: null },
  ];
  const score = scoreFrom(items);
  const verdict: Verdict = isNum(ni) && ni <= 0 && d.years < 5 ? "FALLA" : "DUDOSO";
  return {
    key: "business",
    title: "Business",
    score,
    verdict,
    summary: `${profile.name} · ${ind.label}. Si no puedes explicar en 2 minutos qué vende, cómo gana dinero y quién le paga, no inviertes. Punto.`,
    items,
    notes: ["Este filtro es cualitativo: la app te da los números, la respuesta la das tú marcando las tres preguntas."],
  };
}

/* ── Filtro 2 · Moat ─────────────────────────────────────────────── */
export function moatPillar(d: Derived, m: Metrics, ind: IndustryProfile): PillarResult {
  const gm = pick(m.grossMargin, d.per.at(-1)?.grossMargin ?? null);
  const gmStd = d.stability.grossMarginStdev;
  const roicNow = pick(m.roic, d.per.at(-1)?.roic ?? null);
  const roicAvg = pick(d.avg5.roic, m.roic);
  const opNow = pick(m.operatingMargin, d.per.at(-1)?.opMargin ?? null);
  const opAvg = d.avg5.opMargin;
  const rev = pick(d.ttm.revenue, d.latest?.revenue ?? null);
  // Modelos de bajo margen (retail, distribución): el moat se ve en ROIC y rotación, no en margen bruto
  const lowMarginModel = /retail|discount|grocery|wholesale|distribut|dealer|logistic|food/i.test(ind.label);
  const gmThreshold = lowMarginModel ? 20 : 40;
  const gmAvg = d.avg5.grossMargin;
  const gmTrendUp = isNum(gm) && isNum(gmAvg) && gm >= gmAvg - 1; // volatilidad hacia arriba no es fragilidad
  const items: CheckItem[] = [
    { key: "gm", label: `Margen bruto alto (≥ ${gmThreshold}%)`, value: fmtPct(gm, 1), pass: isNum(gm) ? gm >= gmThreshold : null, detail: lowMarginModel ? "Modelo de bajo margen: el moat se demuestra en ROIC, rotación y escala" : "Poder de precios: la competencia no le obliga a bajar precios", weight: lowMarginModel ? 1 : 2 },
    { key: "gmstab", label: "Margen bruto estable o creciente 5 años", value: isNum(gmStd) ? `±${gmStd.toFixed(1)} pp${gmTrendUp ? " · al alza" : ""}` : "—", pass: isNum(gmStd) ? gmStd <= 3 || gmTrendUp : null, detail: "El moat debe verse en los números: márgenes altos y estables por años" },
    { key: "roic", label: "ROIC > 15% sostenido (promedio 5 años)", value: `${fmtPct(roicAvg, 1)} (hoy ${fmtPct(roicNow, 1)})`, pass: isNum(roicAvg) ? roicAvg >= 15 && (!isNum(roicNow) || roicNow >= 12) : null, detail: "Retorno sobre capital invertido: cuánto genera por cada dólar que emplea", weight: lowMarginModel ? 3 : 2 },
    { key: "optrend", label: "Margen operativo no se deteriora (hoy ≥ promedio 5a − 2 pp)", value: `${fmtPct(opNow, 1)} vs ${fmtPct(opAvg, 1)}`, pass: isNum(opNow) && isNum(opAvg) ? opNow >= opAvg - 2 : null },
    { key: "scale", label: "Escala relevante (ingresos > $10B)", value: fmtBig(rev), pass: isNum(rev) ? rev > 10e9 : null },
  ];
  const score = scoreFrom(items);
  const hard = items.filter((i) => ["gm", "roic"].includes(i.key));
  const verdict: Verdict =
    hard.every((i) => i.pass === true) && (score ?? 0) >= 60 ? "PASA" : isNum(roicAvg) && roicAvg < 8 && isNum(gm) && gm < 25 ? "FALLA" : "DUDOSO";
  return {
    key: "moat",
    title: "Moat",
    score,
    verdict,
    summary: ind.moatHint,
    items,
    notes: ["Nombra el moat en UNA frase (efectos de red / costos de cambio / escala / activo único / marca) y confírmalo con estos números."],
  };
}

/* ── Filtro 3 · Números de gran negocio (5 umbrales) ─────────────── */
export function qualityPillar(d: Derived, m: Metrics): PillarResult & { passCount: number } {
  const roeNow = pick(m.roe, d.per.at(-1)?.roe ?? null);
  const roeAvg = pick(d.avg5.roe, m.roe);
  const roicAvg = pick(d.avg5.roic, m.roic);
  const equityTiny = d.latest && isNum(d.latest.equity) && isNum(d.latest.totalAssets) && d.latest.equity / d.latest.totalAssets < 0.1;
  const roePass = equityTiny ? (isNum(roicAvg) ? roicAvg >= 15 : null) : isNum(roeAvg) ? roeAvg >= 15 && (!isNum(roeNow) || roeNow >= 12) : null;

  const nmNow = pick(m.netMargin, d.per.at(-1)?.netMargin ?? null);
  const nmAvg = d.avg5.netMargin;
  const nmPass = isNum(nmNow) ? nmNow >= 10 && (!isNum(nmAvg) || nmNow >= nmAvg - 2) : null;

  const niCagr = pick(d.growth.netIncome5y, m.epsGrowth5Y);
  const chaos = d.stability.niDrops20;
  const negYears = d.stability.negativeNiYears;
  const growPass = d.years >= 3 ? (isNum(niCagr) ? niCagr > 0 : null) !== false && chaos <= 1 && negYears === 0 : null;

  const debtYears = d.balance.debtToNiYears;
  const netCash = d.balance.netCash;
  const debtPass = isNum(netCash) && netCash >= 0 ? true : isNum(debtYears) ? debtYears < 4 : null;

  const fcfToNi = pick(d.avg5.fcfToNi, d.per.at(-1)?.fcfToNi ?? null);
  const fcfNow = pick(d.ttm.fcf, d.latest?.fcf ?? null);
  const fcfPass = isNum(fcfNow) && fcfNow > 0 ? (isNum(fcfToNi) ? fcfToNi >= 0.8 : true) : isNum(fcfNow) ? false : null;

  const items: CheckItem[] = [
    { key: "roe", label: equityTiny ? "ROE > 15% (patrimonio mínimo por recompras → se usa ROIC)" : "ROE > 15% sostenido", value: equityTiny ? fmtPct(roicAvg, 1) : `${fmtPct(roeAvg, 1)} prom. · hoy ${fmtPct(roeNow, 1)}`, pass: roePass },
    { key: "nm", label: "Margen neto > 10%, estable o creciente", value: `${fmtPct(nmNow, 1)} (prom. 5a ${fmtPct(nmAvg, 1)})`, pass: nmPass },
    { key: "growth", label: "Utilidades crecientes sin años caóticos", value: `CAGR 5a ${fmtPct(niCagr, 1)} · caídas >20%: ${chaos} · años en pérdida: ${negYears}`, pass: growPass },
    { key: "debt", label: "Deuda pagable con < 4 años de utilidades", value: isNum(netCash) && netCash >= 0 ? `Caja neta ${fmtBig(netCash)}` : `${isNum(debtYears) ? debtYears.toFixed(1) : "—"} años`, pass: debtPass },
    { key: "fcf", label: "FCF positivo y cercano a la utilidad contable (≥ 80%)", value: `${fmtBig(fcfNow)} · FCF/UN ${isNum(fcfToNi) ? (fcfToNi * 100).toFixed(0) + "%" : "—"}`, pass: fcfPass, detail: "Caja real, no utilidad de papel" },
  ];
  const passCount = items.filter((i) => i.pass === true).length;
  const known = items.filter((i) => i.pass !== null).length;
  const verdict: Verdict = known === 0 ? "DUDOSO" : passCount === 5 ? "PASA" : passCount === 4 ? "DUDOSO" : "FALLA";
  const score = Math.round((passCount / 5) * 100);
  const notes: string[] = [];
  if (passCount === 4) notes.push("4 de 5: pasa solo si el fallo es temporal y explicable (p. ej., un año de inversión fuerte).");
  if (passCount <= 3 && known >= 4) notes.push("≤ 3 de 5: este filtro descarta cíclicas puras y promesas sin utilidades. Como núcleo, no. Como satélite, otras reglas y tamaño pequeño.");

  // Piotroski F-score (informativo)
  const L = d.latest;
  const P = d.prev;
  if (L && P) {
    let f = 0;
    const roa = (r: typeof L) => (isNum(r.netIncome) && isNum(r.totalAssets) && r.totalAssets > 0 ? r.netIncome / r.totalAssets : null);
    if ((roa(L) ?? -1) > 0) f++;
    if (isNum(L.ocf) && L.ocf > 0) f++;
    if (isNum(roa(L)) && isNum(roa(P)) && roa(L)! > roa(P)!) f++;
    if (isNum(L.ocf) && isNum(L.netIncome) && L.ocf > L.netIncome) f++;
    const lev = (r: typeof L) => (isNum(r.totalDebt) && isNum(r.totalAssets) && r.totalAssets > 0 ? r.totalDebt / r.totalAssets : null);
    if (isNum(lev(L)) && isNum(lev(P)) && lev(L)! <= lev(P)!) f++;
    const cr = (r: typeof L) => (isNum(r.currentAssets) && isNum(r.currentLiabilities) && r.currentLiabilities > 0 ? r.currentAssets / r.currentLiabilities : null);
    if (isNum(cr(L)) && isNum(cr(P)) && cr(L)! >= cr(P)!) f++;
    if (isNum(L.sharesDiluted) && isNum(P.sharesDiluted) && L.sharesDiluted <= P.sharesDiluted) f++;
    const gmr = (r: typeof L) => (isNum(r.grossProfit) && isNum(r.revenue) && r.revenue > 0 ? r.grossProfit / r.revenue : null);
    if (isNum(gmr(L)) && isNum(gmr(P)) && gmr(L)! >= gmr(P)!) f++;
    const at = (r: typeof L) => (isNum(r.revenue) && isNum(r.totalAssets) && r.totalAssets > 0 ? r.revenue / r.totalAssets : null);
    if (isNum(at(L)) && isNum(at(P)) && at(L)! >= at(P)!) f++;
    items.push({ key: "piotroski", label: "Piotroski F-score (salud financiera, 0-9)", value: `${f}/9`, pass: null, detail: "≥7 sólido · ≤3 frágil. Informativo, no cuenta para el filtro." });
  }
  return { key: "quality", title: "Fundamentals", score, verdict, summary: `${passCount} de 5 umbrales de gran negocio.`, items, notes, passCount };
}

/* ── Filtro 4 · Management ───────────────────────────────────────────── */
export function managementPillar(d: Derived, insiders: InsiderView | null, surprises: EarningsSurprise[]): PillarResult {
  const sh = d.capital.sharesChange5yPct;
  const sbcRev = d.capital.sbcToRevenue;
  const payout = d.capital.payoutOfFcf;
  const beats = surprises.filter((s) => isNum(s.surprisePct) && s.surprisePct >= 0).length;
  const nSurp = surprises.filter((s) => isNum(s.surprisePct)).length;
  const items: CheckItem[] = [
    { key: "shares", label: "Acciones en circulación bajan (recompras netas, 5 años)", value: fmtPct(sh, 1, true), pass: isNum(sh) ? sh <= 0 : null, detail: "Dilución > 3% = los dueños pierden participación cada año", weight: 2 },
    { key: "sbc", label: "Compensación en acciones ≤ 5% de ingresos", value: fmtPct(sbcRev, 1), pass: isNum(sbcRev) ? sbcRev <= 5 : null, detail: "SBC alto = recompras que solo tapan dilución" },
    { key: "payout", label: "Devuelve capital con disciplina (recompras + dividendos = 20-110% del FCF, 5a)", value: fmtPct(payout, 0), pass: isNum(payout) ? payout >= 20 && payout <= 110 : null, detail: "Muy bajo: acumula caja sin plan · muy alto: se endeuda para recomprar" },
    { key: "insiders", label: "Insiders no venden en masa (últimos 3 meses)", value: insiders ? `MSPR ${isNum(insiders.mspr) ? insiders.mspr.toFixed(0) : "—"} · compras ${insiders.buys} / ventas ${insiders.sells}` : "Sin datos (requiere Finnhub)", pass: insiders && insiders.buys > insiders.sells ? true : null, detail: "Informativo: en mega-caps los insiders venden por planes programados" },
    { key: "guidance", label: "Cumplen lo que prometen (≥ 6 de 8 trimestres superan estimados)", value: nSurp ? `${beats}/${nSurp}` : "Sin datos (requiere Finnhub)", pass: nSurp >= 4 ? beats / nSurp >= 0.75 : null, weight: 2 },
  ];
  const score = scoreFrom(items);
  const known = items.filter((i) => i.pass !== null).length;
  const dilutionBad = isNum(sh) && sh > 3 && isNum(sbcRev) && sbcRev > 10;
  const verdict: Verdict = known < 2 ? "DUDOSO" : dilutionBad ? "FALLA" : (score ?? 0) >= 60 ? "PASA" : (score ?? 0) >= 40 ? "DUDOSO" : "FALLA";
  return {
    key: "management",
    title: "Management",
    score,
    verdict,
    summary: "No basta con hablar como dueño. Deben actuar como uno: usar bien la caja, cumplir lo que prometen y tener su propia plata invertida.",
    items,
    notes: ["Skin in the game (participación del CEO/fundador) no es automático: revísalo en el proxy statement (DEF 14A) de la empresa."],
  };
}

/* ── Filtro 5 · ¿Estará mejor en 10 años? ────────────────────────── */
export function durabilityPillar(d: Derived, profile: Profile, ind: IndustryProfile, history: PriceHistory): PillarResult {
  const rev10 = d.growth.revenue10y;
  const posYears = d.rows.slice(-10).filter((r) => isNum(r.netIncome) && r.netIncome > 0).length;
  const yrs = Math.min(10, d.rows.length);
  const rnd = d.latest ? (isNum(d.latest.rnd) && isNum(d.latest.revenue) && d.latest.revenue > 0 ? (d.latest.rnd / d.latest.revenue) * 100 : null) : null;
  const ipoYear = profile.ipo ? Number(profile.ipo.slice(0, 4)) : null;
  const age = isNum(ipoYear) ? new Date().getFullYear() - ipoYear : null;
  const w = history.weekly;
  const ret5y = w.length > 100 ? ((w[w.length - 1].c - w[0].c) / w[0].c) * 100 : null;
  const rev3 = d.growth.revenue3y;
  const items: CheckItem[] = [
    { key: "rev10", label: `Ingresos crecen a largo plazo (CAGR ${yrs} años ≥ 8%)`, value: fmtPct(rev10, 1), pass: isNum(rev10) ? rev10 >= 8 : null, weight: 2 },
    { key: "rev3", label: "Sigue creciendo hoy (CAGR 3 años ≥ 5%)", value: fmtPct(rev3, 1), pass: isNum(rev3) ? rev3 >= 5 : null, detail: "Un gran pasado con presente estancado es la antesala del value trap", weight: 2 },
    { key: "posyears", label: `Rentable casi siempre (≥ 8 de ${yrs} años con utilidad)`, value: `${posYears}/${yrs}`, pass: yrs >= 5 ? posYears >= Math.min(8, yrs - 1) : null },
    { key: "tail", label: "Viento de cola estructural del sector", value: ind.tailwind, pass: ind.tailwind === "en contra" ? false : ind.tailwind === "fuerte" ? true : null, detail: "IA, nube, semis, pagos, salud: a favor · tabaco, cable, prensa: en contra" },
    { key: "rnd", label: "Reinvierte en el futuro (I+D / ingresos)", value: fmtPct(rnd, 1), pass: null, detail: "Informativo: alto en tecnología y farma, irrelevante en retail" },
    { key: "age", label: "Historia pública", value: isNum(age) ? `${age} años desde IPO` : "—", pass: isNum(age) ? age >= 10 : null },
    { key: "ret5", label: "El mercado ya lo premió (retorno 5 años)", value: fmtPct(ret5y, 0, true), pass: null, detail: "Contexto, no criterio: un gran negocio puede haber subido mucho y seguir siéndolo" },
    { key: "q1", label: "¿El mundo necesitará más de esto en 10 años?", value: "Tú decides", pass: null },
    { key: "q2", label: "¿Se lo comprará a ESTA empresa? ¿La IA la fortalece o la amenaza?", value: "Tú decides", pass: null },
    { key: "q3", label: "¿Comprarías tranquilo si la bolsa cerrara 5 años?", value: "Tú decides", pass: null },
  ];
  const score = scoreFrom(items);
  const verdict: Verdict = ind.tailwind === "en contra" && (isNum(rev10) ? rev10 < 3 : true) ? "FALLA" : "DUDOSO";
  return {
    key: "durability",
    title: "10-Year Test",
    score,
    verdict,
    summary: "Si la respuesta a las tres preguntas no es un sí tranquilo, sigue buscando.",
    items,
    notes: ["Los números miden el pasado; las tres preguntas cualitativas son el filtro real. Márcalas cuando las tengas claras."],
  };
}

export function pillarScoreOf(p: PillarResult): number {
  return isNum(p.score) ? clamp(p.score, 0, 100) : 50;
}

export const _fmt = { fmtX };
