/** Portafolio principal calculado con las órdenes guardadas en Supabase y cierres de Yahoo (el nombre "Ibkr" es histórico). */
import { cached } from "./cache";
import { yahooSerie } from "./yahoo";
import { leerMovimientos } from "./portafolioPublico";
import { aDia } from "@/lib/analysis/portafolio";
import type { PricePoint } from "@/lib/analysis/types";

/** Día hábil a medianoche UTC: así una fecha de IBKR y la barra diaria de Yahoo del mismo día coinciden. */
export const diaUTC = (fecha: string) => Date.parse(`${fecha}T00:00:00Z`);

/**
 * Rendimiento ponderado por tiempo (TWR) calculado SOLO con las órdenes guardadas (fecha, cantidad, precio)
 * y los cierres diarios de Yahoo: no depende de IBKR. Cada compra entra al precio pagado y cada venta sale
 * al precio vendido, así las ganancias o pérdidas realizadas quedan dentro de la curva.
 * ponytail: no cuenta dividendos ni el efectivo sin invertir.
 */
export function nivelesIbkr(): Promise<PricePoint[]> {
  return cached("mov:niveles", 15 * 60 * 1000, async () => (await calcular()).niveles);
}

/** Peso de cada posición al último cierre, en %. */
export function pesosIbkr(): Promise<Array<{ ticker: string; peso: number }>> {
  return cached("mov:pesos", 15 * 60 * 1000, async () => (await calcular()).pesos);
}

/** Pesos con que abrió la última sesión (antes de sus compras y ventas, al cierre anterior). */
export async function pesosApertura() {
  return (await calcular()).apertura;
}

const calcular = () =>
  cached("mov:calc", 15 * 60 * 1000, async () => {
    const mov = (await leerMovimientos("principal")).filter((m) => m.cantidad && m.precio).reverse(); // viejo → nuevo
    const tickers = [...new Set(mov.map((m) => m.ticker))];
    const series = await Promise.all(tickers.map((t) => yahooSerie(t, "2y", "1d", 15 * 60 * 1000).catch(() => null)));
    const cierres = new Map<string, Map<number, number>>();
    const dias = new Set<number>();
    tickers.forEach((t, k) => {
      const m = new Map<number, number>();
      for (const p of series[k]?.points ?? []) m.set(aDia(p.t), p.c), dias.add(aDia(p.t));
      cierres.set(t, m);
    });
    const ultimo = new Map<string, number>();
    const h = new Map<string, number>();
    const valor = () => [...h].reduce((s, [t, q]) => s + q * (ultimo.get(t) ?? 0), 0);
    let nivel = 1, j = 0;
    const niveles: PricePoint[] = [];
    const pesar = () => {
      const total = valor();
      return [...h].filter(([, q]) => q > 1e-6).map(([t, q]) => ({ ticker: t, peso: Math.round((q * (ultimo.get(t) ?? 0) * 10000) / total) / 100 })).sort((a, b) => b.peso - a.peso);
    };
    let apertura: ReturnType<typeof pesar> = [];
    for (const d of [...dias].sort((a, b) => a - b)) {
      const antes = valor();
      apertura = pesar();
      let flujo = 0;
      while (j < mov.length && diaUTC(mov[j].fecha) <= d) {
        const m = mov[j++], q = Number(m.cantidad), px = Number(m.precio), s = m.tipo === "venta" ? -1 : 1;
        h.set(m.ticker, Math.max(0, (h.get(m.ticker) ?? 0) + s * q));
        flujo += s * q * px;
        if (!ultimo.has(m.ticker)) ultimo.set(m.ticker, px);
      }
      if (!j) continue;
      for (const t of h.keys()) { const c = cierres.get(t)?.get(d); if (c) ultimo.set(t, c); }
      const base = antes + flujo;
      if (base > 0) nivel *= valor() / base;
      niveles.push({ t: d, c: nivel });
    }
    return { niveles, pesos: pesar(), apertura };
  });
