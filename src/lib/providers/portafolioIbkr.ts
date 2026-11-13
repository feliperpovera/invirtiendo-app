/**
 * Portafolio real de Invirtiendoo en Interactive Brokers, leído de Supabase.
 * Lo carga una tarea diaria que consulta IBKR (get_pa_performance_all_periods y
 * get_account_positions) y llama a la función `portafolio_ibkr_cargar`: aquí solo hay
 * porcentajes. Nunca el valor de la cuenta, cantidades ni precios de compra.
 */
import { cached } from "./cache";
import type { PricePoint } from "@/lib/analysis/types";

const cfg = () => ({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY });

async function leer<T>(ruta: string): Promise<T> {
  const { url, key } = cfg();
  if (!url || !key) throw new Error("Sin SUPABASE_URL / SUPABASE_KEY");
  const r = await fetch(`${url}/rest/v1/${ruta}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`portafolio: HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Día hábil a medianoche UTC: así una fecha de IBKR y la barra diaria de Yahoo del mismo día coinciden. */
export const diaUTC = (fecha: string) => Date.parse(`${fecha}T00:00:00Z`);

/** [fecha, YTD % de IBKR] */
const MANUAL: Array<[string, number]> = [["2026-11-12", 9.16]];

/** Índice de rendimiento ponderado por tiempo (TWR), uno por día, del más viejo al más nuevo. */
export function nivelesIbkr(): Promise<PricePoint[]> {
  return cached("ibkr:niveles", 10 * 60 * 1000, async () => {
    const filas = await leer<Array<{ fecha: string; nivel: number }>>("portafolio_ibkr?select=fecha,nivel&order=fecha.asc&limit=5000");
    const pts = filas.map((f) => ({ t: diaUTC(f.fecha), c: Number(f.nivel) })).filter((p) => p.c > 0);
    // Cierres leídos a mano de la app de IBKR mientras el conector está caído: YTD oficial.
    for (const [fecha, ytd] of MANUAL) {
      const t = diaUTC(fecha), base = [...pts].reverse().find((p) => p.t <= Date.UTC(Number(fecha.slice(0, 4)) - 1, 11, 31));
      if (base && t > pts[pts.length - 1].t) pts.push({ t, c: base.c * (1 + ytd / 100) });
    }
    return pts;
  });
}

/** Peso de cada posición al último cierre, en %. */
export function pesosIbkr(): Promise<Array<{ ticker: string; peso: number }>> {
  return cached("ibkr:pesos", 10 * 60 * 1000, async () => {
    const filas = await leer<Array<{ ticker: string; peso: number }>>("portafolio_ibkr_pesos?select=ticker,peso&order=peso.desc");
    return filas.map((f) => ({ ticker: f.ticker, peso: Number(f.peso) }));
  });
}
