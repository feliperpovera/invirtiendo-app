import type { MarketPulse, PricePoint, N } from "./types";
import { isNum, clamp } from "@/lib/format";

/** Interpolación lineal por tramos: [[x, y], ...] ordenados por x. */
function piece(x: number, pts: Array<[number, number]>): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return pts[pts.length - 1][1];
}

const ma = (pts: PricePoint[], n: number): N => {
  const s = pts.slice(-n);
  return s.length === n ? s.reduce((a, b) => a + b.c, 0) / n : null;
};

export interface IndexInput {
  symbol: string;
  name: string;
  price: number;
  changePct: N;
  high52: N;
  closes1y: PricePoint[];
}

export function computeMood(spx: IndexInput, vix: number): MarketPulse["mood"] {
  const comps: MarketPulse["mood"]["components"] = [];
  // 1) VIX: bajo = complacencia (codicia), alto = miedo
  const vixScore = piece(vix, [[12, 95], [14, 82], [18, 58], [22, 42], [28, 22], [35, 6]]);
  comps.push({ key: "vix", label: "VIX (miedo implícito)", value: vix.toFixed(1), score: Math.round(vixScore) });
  // 2) Momentum: S&P vs media de 125 días
  const m125 = ma(spx.closes1y, 125);
  if (isNum(m125)) {
    const dev = (spx.price / m125 - 1) * 100;
    const s = piece(dev, [[-8, 10], [-3, 35], [0, 50], [3, 68], [8, 90]]);
    comps.push({ key: "mom", label: "S&P 500 vs media 125 días", value: `${dev >= 0 ? "+" : ""}${dev.toFixed(1)}%`, score: Math.round(s) });
  }
  // 3) Distancia al máximo de 52 semanas
  if (isNum(spx.high52) && spx.high52 > 0) {
    const dd = (spx.price / spx.high52 - 1) * 100;
    const s = piece(dd, [[-20, 8], [-10, 35], [-5, 58], [-2, 78], [0, 92]]);
    comps.push({ key: "high", label: "S&P 500 vs máximo 52 sem.", value: `${dd.toFixed(1)}%`, score: Math.round(s) });
  }
  // 4) Retorno 20 días
  const c = spx.closes1y;
  if (c.length > 21) {
    const r20 = (c[c.length - 1].c / c[c.length - 21].c - 1) * 100;
    const s = piece(r20, [[-6, 12], [-2, 38], [0, 50], [2, 65], [6, 88]]);
    comps.push({ key: "r20", label: "S&P 500 últimos 20 días", value: `${r20 >= 0 ? "+" : ""}${r20.toFixed(1)}%`, score: Math.round(s) });
  }
  const score = Math.round(clamp(comps.reduce((a, b) => a + b.score, 0) / comps.length, 0, 100));
  let label: string;
  let advice: string;
  if (score <= 25) {
    label = "Miedo extremo";
    advice = "Revisa tu watchlist. Valida tesis y valoración. Si compras, hazlo por tramos.";
  } else if (score <= 45) {
    label = "Miedo";
    advice = "Buen momento para repasar la lista de espera: compra solo lo que llegue a su zona.";
  } else if (score <= 55) {
    label = "Neutral";
    advice = "Sigue tu plan y tus aportes. No fuerces una decisión.";
  } else if (score <= 75) {
    label = "Codicia";
    advice = "Disciplina: no perseguir nada que subió >20% en un mes. Revisa márgenes de seguridad.";
  } else {
    label = "Codicia extrema";
    advice = "Baja el ritmo. Revisa precio y margin of safety antes de cada tramo.";
  }
  return { score, label, advice, components: comps };
}

export function vixLabel(v: number): string {
  if (v < 13) return "Complacencia";
  if (v < 18) return "Calma";
  if (v < 25) return "Nerviosismo";
  if (v < 35) return "Miedo";
  return "Pánico";
}

/** Referencias de múltiplo del mercado (aprox.; se pueden sobreescribir por env). */
export function marketMultiples(): { spx: N; ndx: N } {
  const spx = Number(process.env.MARKET_FWD_PE_SPX ?? 22.5);
  const ndx = Number(process.env.MARKET_FWD_PE_NDX ?? 29);
  return { spx: Number.isFinite(spx) ? spx : null, ndx: Number.isFinite(ndx) ? ndx : null };
}

export function ytdPct(closes1y: PricePoint[], price: number): N {
  const year = new Date().getFullYear();
  const first = closes1y.find((p) => new Date(p.t).getFullYear() === year);
  // último cierre del año anterior si existe
  const prevYear = closes1y.filter((p) => new Date(p.t).getFullYear() === year - 1);
  const base = prevYear.length ? prevYear[prevYear.length - 1].c : first?.c;
  return isNum(base) && base > 0 ? (price / base - 1) * 100 : null;
}
