import { yahooIndex } from "./yahoo";
import { cached } from "./cache";
import type { PricePoint } from "@/lib/analysis/types";

/** Resumen de mercados al estilo TradingView: índices, tasas, dólar, materias primas y cripto (Yahoo, 1 año diario). */
export const INSTRUMENTOS = [
  { s: "^GSPC", n: "S&P 500", g: "Índices" },
  { s: "^NDX", n: "Nasdaq-100", g: "Índices" },
  { s: "^DJI", n: "Dow Jones", g: "Índices" },
  { s: "^RUT", n: "Russell 2000", g: "Índices" },
  { s: "^VIX", n: "VIX", g: "Índices" },
  { s: "^TNX", n: "Tesoro 10 años", g: "Tasas y dólar", pct: true },
  { s: "^TYX", n: "Tesoro 30 años", g: "Tasas y dólar", pct: true },
  { s: "DX-Y.NYB", n: "Índice dólar (DXY)", g: "Tasas y dólar" },
  { s: "COP=X", n: "Dólar en Colombia (USD/COP)", g: "Tasas y dólar" },
  { s: "EURUSD=X", n: "EUR/USD", g: "Tasas y dólar" },
  { s: "CL=F", n: "Petróleo WTI", g: "Materias primas" },
  { s: "BZ=F", n: "Petróleo Brent", g: "Materias primas" },
  { s: "GC=F", n: "Oro", g: "Materias primas" },
  { s: "HG=F", n: "Cobre", g: "Materias primas" },
  { s: "BTC-USD", n: "Bitcoin", g: "Cripto" },
  { s: "ETH-USD", n: "Ethereum", g: "Cripto" },
] as const;

export interface Instrumento { symbol: string; nombre: string; grupo: string; tasa: boolean; precio: number; cambio: number | null; ytd: number | null; a1: number | null; serie: PricePoint[] }

const pct = (a?: number, b?: number) => (a && b ? (a / b - 1) * 100 : null);

export function mercados(): Promise<Instrumento[]> {
  return cached("mercados:v1", 5 * 60 * 1000, async () => {
    const out = await Promise.all(
      INSTRUMENTOS.map(async (i): Promise<Instrumento | null> => {
        try {
          const r = await yahooIndex(i.s);
          const c = r.closes1y;
          const anio = new Date().getUTCFullYear();
          const base = [...c].reverse().find((p) => new Date(p.t).getUTCFullYear() < anio)?.c;
          return { symbol: i.s, nombre: i.n, grupo: i.g, tasa: "pct" in i, precio: r.price, cambio: r.changePct, ytd: pct(r.price, base), a1: pct(r.price, c[0]?.c), serie: c.filter((_, k) => k % 3 === 0 || k === c.length - 1) };
        } catch {
          return null;
        }
      }),
    );
    return out.filter((x): x is Instrumento => !!x);
  });
}
