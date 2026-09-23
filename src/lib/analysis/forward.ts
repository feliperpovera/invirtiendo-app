import type { N } from "./types";
import { isNum, clamp } from "@/lib/format";

/**
 * Modelo único de Fair Value, mirando hacia adelante (el método de The Intelligent
 * Investor / rankingstock.com): la acción vale lo que ganará el año que viene por el
 * múltiplo que justifica su crecimiento esperado, contrastado con lo que estiman
 * plataformas independientes. Todo objetivo: consenso de analistas y plataformas, sin
 * preguntas al usuario. Estas funciones son puras y las usan el servidor y el cliente,
 * así el número de la tarjeta es exactamente el del motor.
 */

export interface PlatformEstimate {
  fuente: string;
  /** modelo = valor intrínseco/fair value propio de la plataforma · objetivo = precio objetivo de analistas */
  tipo: "modelo" | "objetivo";
  valor: number;
  url: string;
}

/**
 * Regla del método: el forward P/E justo ≈ crecimiento esperado del EPS (%), acotado.
 *
 * Con un matiz de prudencia que el método puro no tiene: el consenso de analistas llega
 * sistemáticamente alto (el EPS estimado a un año se revisa a la baja mucho más veces de
 * las que se revisa al alza), así que pagar PEG = 1 sobre una cifra ya optimista es
 * optimismo al cuadrado. El múltiplo se calcula sobre el crecimiento RECORTADO, y la banda
 * es más estrecha: 10x para el que apenas crece, 22x como techo aunque prometa 60%.
 */
export const PE_MIN = 10;
export const PE_MAX = 22;
export const PRUDENCIA = 0.85;
export function justifiedForwardPe(growthPct: N): N {
  return isNum(growthPct) ? clamp(growthPct * PRUDENCIA, PE_MIN, PE_MAX) : null;
}

/**
 * Recorte al precio objetivo de los analistas antes de entrar en la mediana. Un precio
 * objetivo es un pronóstico de PRECIO a 12 meses, no una estimación de valor intrínseco,
 * y viene con sesgo al alza conocido. Entra, pero un escalón por debajo.
 */
export const RECORTE_OBJETIVO = 0.9;

/** Crecimiento esperado: promedio del EPS de este año y el próximo según consenso; si no hay, ingresos. */
export function expectedGrowthForward(e: { epsG0: N; epsG1: N; revG0: N; revG1: N } | null | undefined, fallback: N): { g: N; fuente: string } {
  const eps = [e?.epsG0, e?.epsG1].filter(isNum) as number[];
  if (eps.length) return { g: clamp(eps.reduce((a, b) => a + b, 0) / eps.length, -20, 80), fuente: eps.length === 2 ? "EPS consenso este año y próximo" : "EPS consenso" };
  const rev = [e?.revG0, e?.revG1].filter(isNum) as number[];
  if (rev.length) return { g: clamp(rev.reduce((a, b) => a + b, 0) / rev.length, -20, 80), fuente: "ingresos consenso" };
  return { g: isNum(fallback) ? clamp(fallback, -20, 80) : null, fuente: "estimación de crecimiento" };
}

export function median(v: number[]): N {
  const o = [...v].sort((a, b) => a - b);
  if (!o.length) return null;
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

/**
 * Fair Value final = MEDIANA de {modelo adelantado, cada plataforma con modelo propio,
 * UN precio objetivo (la mediana de los objetivos de analistas)}. La mediana evita que
 * un DCF muy conservador o un objetivo eufórico manden solos. Los precios objetivo
 * cuentan una sola vez: Yahoo, StockAnalysis y TradingView reportan el mismo consenso.
 */
/**
 * Diferencia máxima tolerable entre la fuente más alta y la más baja, en % del Fair Value.
 * Por encima de esto el número no aguanta una recomendación de compra: da igual que la
 * mediana salga con descuento si un DCF dice 185 y el modelo dice 3.443.
 */
export const DISPERSION_MAX = 60;

export function fuentesDeAcuerdo(componentes: Array<{ valor: number }>, fairValue: N): boolean {
  const vals = componentes.map((c) => c.valor).filter((x) => isNum(x) && x > 0);
  if (vals.length < 2 || !isNum(fairValue) || fairValue <= 0) return true;
  return ((Math.max(...vals) - Math.min(...vals)) / fairValue) * 100 <= DISPERSION_MAX;
}

export function fairValueMedian(modelo: N, platforms: PlatformEstimate[]): { fairValue: N; componentes: Array<{ fuente: string; valor: number }> } {
  const componentes: Array<{ fuente: string; valor: number }> = [];
  if (isNum(modelo) && modelo > 0) componentes.push({ fuente: "Modelo adelantado", valor: modelo });
  for (const p of platforms) if (p.tipo === "modelo" && p.valor > 0) componentes.push({ fuente: p.fuente, valor: p.valor });
  const objetivo = median(platforms.filter((p) => p.tipo === "objetivo" && p.valor > 0).map((p) => p.valor));
  if (isNum(objetivo)) componentes.push({ fuente: `Precio objetivo analistas (−${Math.round((1 - RECORTE_OBJETIVO) * 100)}%)`, valor: objetivo * RECORTE_OBJETIVO });
  return { fairValue: median(componentes.map((c) => c.valor)), componentes };
}
