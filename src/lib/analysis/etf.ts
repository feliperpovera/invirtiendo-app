import type { EtfProfile, EtfHolding } from "@/lib/providers/yahoo";
import type { N, Quote } from "./types";
import { isNum, clamp } from "@/lib/format";

export interface EtfEval {
  profile: EtfProfile;
  quote: Quote;
  /** Costo en dólares de la comisión sobre $10.000 en 10 años (interés compuesto al 8%) */
  costo10k: N;
  /** Peso de las 10 mayores posiciones */
  top10: N;
  /** Peso del mayor sector */
  topSector: N;
  /** Volatilidad anualizada de los retornos anuales publicados */
  volAnual: N;
  /** Peor año publicado */
  peorAnio: { year: string; value: number } | null;
  score: { total: number; costo: N; diversificacion: N; historial: N; tamano: N };
  checks: Array<{ label: string; value: string; pass: boolean | null; detail?: string }>;
}

const fmtPctS = (v: N, d = 2) => (isNum(v) ? `${v.toFixed(d)}%` : "—");
const fmtBigS = (v: N) => {
  if (!isNum(v)) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
};

/** Lo que te cuesta la comisión sobre $10.000 en 10 años si la cartera rinde 8%. */
export function costoComision(expensePct: N, capital = 10000, años = 10, retorno = 0.08): N {
  if (!isNum(expensePct)) return null;
  const bruto = capital * Math.pow(1 + retorno, años);
  const neto = capital * Math.pow(1 + retorno - expensePct / 100, años);
  return bruto - neto;
}

export function evaluarEtf(profile: EtfProfile, quote: Quote): EtfEval {
  const top10 = profile.holdings.length ? profile.holdings.reduce((s, h) => s + h.weight, 0) : null;
  const topSector = profile.sectors.length ? profile.sectors[0].weight : null;
  const costo10k = costoComision(profile.expenseRatio);

  const anual = profile.annual.filter((a) => isNum(a.value));
  const volAnual = (() => {
    if (anual.length < 3) return null;
    const m = anual.reduce((s, a) => s + a.value, 0) / anual.length;
    return Math.sqrt(anual.reduce((s, a) => s + (a.value - m) ** 2, 0) / (anual.length - 1));
  })();
  const peorAnio = anual.length ? anual.reduce((a, b) => (b.value < a.value ? b : a)) : null;

  // Puntajes 0-100 sobre criterios objetivos
  const e = profile.expenseRatio;
  const sCosto = isNum(e) ? clamp(100 - (e - 0.03) * 110, 0, 100) : null;
  const sDiv = isNum(top10) ? clamp(100 - (top10 - 20) * 1.6, 0, 100) : null;
  const r5 = profile.returns.y5 ?? profile.returns.y3;
  const sHist = isNum(r5) ? clamp(30 + r5 * 3.5, 0, 100) : null;
  const sTam = isNum(profile.aum) ? clamp(Math.log10(profile.aum / 1e8) * 33, 0, 100) : null;
  const parts: Array<[N, number]> = [
    [sCosto, 30],
    [sDiv, 22],
    [sHist, 30],
    [sTam, 18],
  ];
  const ok = parts.filter(([v]) => isNum(v)) as Array<[number, number]>;
  const w = ok.reduce((s, [, x]) => s + x, 0);
  const total = w ? Math.round(ok.reduce((s, [v, x]) => s + v * x, 0) / w) : 0;

  const checks: EtfEval["checks"] = [
    { label: "Comisión anual ≤ 0.20%", value: fmtPctS(e), pass: isNum(e) ? e <= 0.2 : null, detail: isNum(costo10k) ? `Te cuesta $${costo10k.toFixed(0)} sobre $10.000 en 10 años` : undefined },
    { label: "Patrimonio > $1.000M (liquidez y permanencia)", value: fmtBigS(profile.aum), pass: isNum(profile.aum) ? profile.aum > 1e9 : null },
    { label: "Top 10 posiciones ≤ 45% (diversificación)", value: fmtPctS(top10, 1), pass: isNum(top10) ? top10 <= 45 : null, detail: "Por encima de 50% dependes de un puñado de empresas" },
    { label: "Sector mayor ≤ 45%", value: profile.sectors.length ? `${profile.sectors[0].label} ${fmtPctS(topSector, 0)}` : "—", pass: isNum(topSector) ? topSector <= 45 : null },
    { label: "Historial ≥ 5 años", value: profile.inception ? `desde ${profile.inception.slice(0, 4)}` : "—", pass: profile.inception ? new Date(profile.inception).getFullYear() <= new Date().getFullYear() - 5 : null },
    { label: "Retorno anualizado 5 años", value: fmtPctS(profile.returns.y5, 1), pass: isNum(profile.returns.y5) ? profile.returns.y5 > 0 : null },
    { label: "Réplica de acciones (no apalancado ni inverso)", value: profile.legalType ?? "—", pass: profile.legalType ? !/leverage|inverse/i.test(profile.legalType) : null },
  ];

  return { profile, quote, costo10k, top10, topSector, volAnual, peorAnio, score: { total, costo: sCosto, diversificacion: sDiv, historial: sHist, tamano: sTam }, checks };
}

/** Solapamiento entre dos ETFs con base en sus 10 mayores posiciones. */
export function solapamiento(a: EtfHolding[], b: EtfHolding[]): { pct: number; comunes: Array<{ symbol: string; a: number; b: number }> } {
  const mapB = new Map(b.map((h) => [h.symbol, h.weight]));
  const comunes: Array<{ symbol: string; a: number; b: number }> = [];
  let pct = 0;
  for (const h of a) {
    const w = mapB.get(h.symbol);
    if (isNum(w)) {
      comunes.push({ symbol: h.symbol, a: h.weight, b: w });
      pct += Math.min(h.weight, w);
    }
  }
  comunes.sort((x, y) => Math.min(y.a, y.b) - Math.min(x.a, x.b));
  return { pct, comunes };
}

/** Consejo de ritmo según el índice de miedo y codicia. */
export function consejoPorAnimo(score: N): { titulo: string; texto: string } {
  if (!isNum(score)) return { titulo: "Aporta con calendario", texto: "Sin lectura del mercado: mantén tus aportes periódicos." };
  if (score <= 25) return { titulo: "Miedo extremo", texto: "El mejor momento del aporte periódico. Si tienes liquidez, adelanta un tramo." };
  if (score <= 45) return { titulo: "Miedo", texto: "Mantén el aporte y considera subirlo. Los ETFs amplios no necesitan que aciertes el fondo." };
  if (score <= 55) return { titulo: "Neutral", texto: "Sigue el calendario. No cambies el plan por el titular del día." };
  if (score <= 75) return { titulo: "Codicia", texto: "Aporta igual, pero no adelantes capital extra. Guarda liquidez para las caídas." };
  return { titulo: "Codicia extrema", texto: "Aporte normal y nada más. Acumula la liquidez sobrante para el próximo susto." };
}
