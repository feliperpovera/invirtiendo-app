/**
 * Portafolio Invirtiendoo (cuenta real en Interactive Brokers) contra el S&P 500.
 * Módulo puro: lo usa la API y lo cubre scripts/portafolio.test.mjs.
 *
 * - Periodos históricos: el rendimiento ponderado por tiempo (TWR) que calcula IBKR, que
 *   no cuenta los depósitos como ganancia. Termina en el último cierre que IBKR publicó.
 * - "Hoy": estimado en vivo con los pesos de las posiciones al último cierre por el precio
 *   de cada una en este momento.
 * La cuenta empezó en diciembre de 2025. En periodos más largos (1, 3 y 5 años) el S&P se ve
 * completo y el portafolio arranca en su primer día pegado a la línea del S&P: las dos líneas
 * se comparan desde ahí, y el "por encima / por debajo" se mide solo sobre el tramo común.
 */
import type { PricePoint } from "./types";

export const RANGOS = {
  "1D": { etiqueta: "Hoy", ttl: 60, meses: 0 },
  "1M": { etiqueta: "1 mes", ttl: 900, meses: 1 },
  "3M": { etiqueta: "3 meses", ttl: 900, meses: 3 },
  "6M": { etiqueta: "6 meses", ttl: 900, meses: 6 },
  YTD: { etiqueta: "En el año", ttl: 900, meses: 0 },
  "1A": { etiqueta: "1 año", ttl: 900, meses: 12 },
  "3A": { etiqueta: "3 años", ttl: 900, meses: 36 },
  "5A": { etiqueta: "5 años", ttl: 900, meses: 60 },
} as const;
export type Rango = keyof typeof RANGOS;

export interface Serie {
  points: PricePoint[];
  /** Base explícita (cierre anterior en intradía). Sin ella, la base es el primer precio del periodo. */
  base?: number | null;
}

export interface Comparacion {
  /** Nivel con base 100 al inicio del periodo. El portafolio es null antes de que existiera. */
  puntos: Array<{ t: number; indice: number; portafolio: number | null }>;
  /**
   * indice = S&P en todo el periodo · portafolio = desde que existe ·
   * indiceComun = S&P en ese mismo tramo (contra esto se compara el portafolio)
   */
  retorno: { indice: number; portafolio: number; indiceComun: number };
  /** Nivel del S&P cuando arranca el portafolio: 100 si arranca con el periodo */
  ancla: number;
  /** Cuándo arranca el portafolio si el periodo empieza antes que la cuenta; si no, null */
  inicioPortafolio: number | null;
  incluidas: Array<{ ticker: string; peso: number }>;
  excluidas: string[];
}

/**
 * Alinea cada posición al eje de tiempo del índice (último precio conocido en cada instante)
 * y arma el valor del portafolio comprado al inicio. Una posición entra si tiene precio desde
 * el comienzo del periodo, con una tolerancia del 2% del lapso para barras que faltan.
 */
export function compararConIndice(indice: Serie, posiciones: Array<{ ticker: string; peso: number; serie: Serie | null }>): Comparacion | null {
  const eje = [...indice.points].sort((a, b) => a.t - b.t);
  if (eje.length < 2) return null;
  const t0 = eje[0].t;
  const tolerancia = (eje[eje.length - 1].t - t0) * 0.02;
  const baseIndice = indice.base && indice.base > 0 ? indice.base : eje[0].c;

  const activas: Array<{ ticker: string; peso: number; base: number; valores: number[] }> = [];
  const excluidas: string[] = [];
  for (const p of posiciones) {
    const pts = [...(p.serie?.points ?? [])].filter((x) => x.c > 0).sort((a, b) => a.t - b.t);
    if (!pts.length || pts[0].t > t0 + tolerancia) {
      excluidas.push(p.ticker);
      continue;
    }
    const base = p.serie?.base && p.serie.base > 0 ? p.serie.base : pts[0].c;
    // Último precio conocido en cada punto del eje; antes de su primera barra, la base.
    const valores: number[] = [];
    let j = -1;
    for (const { t } of eje) {
      while (j + 1 < pts.length && pts[j + 1].t <= t) j++;
      valores.push(j >= 0 ? pts[j].c : base);
    }
    activas.push({ ticker: p.ticker, peso: p.peso, base, valores });
  }
  if (!activas.length) return null;

  const pesoTotal = activas.reduce((s, a) => s + a.peso, 0);
  const puntos = eje.map((x, i) => ({
    t: x.t,
    indice: (x.c / baseIndice) * 100,
    portafolio: activas.reduce((s, a) => s + (a.peso / pesoTotal) * (a.valores[i] / a.base), 0) * 100,
  }));
  const ultimo = puntos[puntos.length - 1];
  return {
    puntos,
    retorno: { indice: ultimo.indice - 100, portafolio: ultimo.portafolio - 100, indiceComun: ultimo.indice - 100 },
    ancla: 100,
    inicioPortafolio: null,
    incluidas: activas.map((a) => ({ ticker: a.ticker, peso: (a.peso / pesoTotal) * 100 })),
    excluidas,
  };
}

const DIA = 86400000;
/** Una marca de tiempo de Yahoo (barra diaria, 9:30 de Nueva York) a medianoche UTC de ese día. */
export const aDia = (t: number) => Math.floor(t / DIA) * DIA;

/** Día de arranque de un periodo histórico, contado hacia atrás desde el último cierre publicado. */
export function inicioRango(rango: Rango, ultimo: number): number {
  const d = new Date(ultimo);
  if (rango === "YTD") return Date.UTC(d.getUTCFullYear() - 1, 11, 31);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - RANGOS[rango].meses, d.getUTCDate());
}

/**
 * Historia de IBKR contra el S&P 500 desde `inicio`. Ambas series van a medianoche UTC por día.
 * El S&P se corta en el último cierre de IBKR (la barra de hoy todavía no tiene dato de la
 * cuenta) y las dos arrancan el mismo día: el último hábil en o antes del inicio.
 */
export function compararHistoria(sp: PricePoint[], ibkr: PricePoint[], inicio: number): Comparacion | null {
  if (ibkr.length < 2) return null;
  const fin = ibkr[ibkr.length - 1].t;
  const s = sp.filter((p) => p.t <= fin);
  let i0 = 0;
  for (let i = 0; i < s.length; i++) if (s[i].t <= inicio) i0 = i;
  if (!s.length) return null;
  const t0 = s[i0].t;
  let j0 = -1;
  for (let j = 0; j < ibkr.length; j++) if (ibkr[j].t <= t0) j0 = j;
  if (j0 >= 0) return compararConIndice({ points: s.slice(i0) }, [{ ticker: "IBKR", peso: 100, serie: { points: ibkr.slice(j0) } }]);

  // El periodo empieza antes que la cuenta: el S&P va completo y el portafolio arranca su
  // primer día en el nivel que tenía el S&P ese día, y desde ahí sigue su propio rendimiento.
  const eje = s.slice(i0);
  if (eje.length < 2) return null;
  const base = eje[0].c;
  let ancla: number | null = null;
  let baseIb = 0;
  let inicioPortafolio: number | null = null;
  let j = -1;
  const puntos = eje.map((p) => {
    const indice = (p.c / base) * 100;
    while (j + 1 < ibkr.length && ibkr[j + 1].t <= p.t) j++;
    if (j < 0) return { t: p.t, indice, portafolio: null };
    if (ancla === null) {
      ancla = indice;
      baseIb = ibkr[j].c;
      inicioPortafolio = p.t;
    }
    return { t: p.t, indice, portafolio: (ancla * ibkr[j].c) / baseIb };
  });
  const u = puntos[puntos.length - 1];
  if (ancla === null || u.portafolio === null) return null;
  const a: number = ancla;
  return {
    puntos,
    retorno: { indice: u.indice - 100, portafolio: (u.portafolio / a) * 100 - 100, indiceComun: (u.indice / a) * 100 - 100 },
    ancla: a,
    inicioPortafolio,
    incluidas: [{ ticker: "IBKR", peso: 100 }],
    excluidas: [],
  };
}

/** Lo que se mueve ahora: el S&P y el portafolio (pesos de IBKR × precio actual) contra el cierre anterior. */
export interface Vivo {
  /** Hora de la última barra intradía */
  t: number;
  /** Día de la sesión intradía (medianoche UTC) */
  dia: number;
  spAnterior: number;
  spAhora: number;
  /** Valor del portafolio ahora ÷ valor al cierre anterior */
  factor: number;
}

/** Última sesión antes de `dia`, a partir de todas las barras diarias (con o sin cierre). */
export function sesionAnterior(sesiones: number[], dia: number): number | null {
  let s: number | null = null;
  for (const t of sesiones.map(aDia)) if (t < dia && (s === null || t > s)) s = t;
  return s;
}

/** Si Yahoo dejó sin cierre la barra de la sesión anterior, se completa con el cierre anterior del intradía. */
export function completarSesion(sp: PricePoint[], sesion: number | null, cierre: number): PricePoint[] {
  if (sesion === null || !(cierre > 0) || sp.some((p) => p.t === sesion)) return sp;
  return [...sp, { t: sesion, c: cierre }].sort((a, b) => a.t - b.t);
}

/**
 * Agrega el punto "ahora" al final de la historia. Solo si IBKR está al día (su último cierre es
 * la sesión anterior): si la sincronización se atrasó, pegar el movimiento de hoy sobre un cierre
 * más viejo dejaría un hueco sin contar, y es mejor que el gráfico se quede en el dato oficial.
 */
export function agregarVivo(comp: Comparacion, ultimoIbkr: number, sesionAnt: number | null, v: Vivo | null): { comp: Comparacion; enVivo: boolean } {
  if (!v || v.dia <= ultimoIbkr || sesionAnt !== ultimoIbkr || !(v.spAnterior > 0) || !(v.factor > 0)) return { comp, enVivo: false };
  const u = comp.puntos[comp.puntos.length - 1];
  if (u.portafolio === null) return { comp, enVivo: false };
  const ahora = { t: v.t, indice: (u.indice * v.spAhora) / v.spAnterior, portafolio: u.portafolio * v.factor };
  return {
    comp: {
      ...comp,
      puntos: [...comp.puntos, ahora],
      retorno: {
        indice: ahora.indice - 100,
        portafolio: (ahora.portafolio / comp.ancla) * 100 - 100,
        indiceComun: (ahora.indice / comp.ancla) * 100 - 100,
      },
    },
    enVivo: true,
  };
}
