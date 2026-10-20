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
  { s: "^STOXX50E", n: "Euro Stoxx 50", g: "Mundo", pais: "🇪🇺" },
  { s: "^GDAXI", n: "DAX (Alemania)", g: "Mundo", pais: "🇩🇪" },
  { s: "^FTSE", n: "FTSE 100 (Reino Unido)", g: "Mundo", pais: "🇬🇧" },
  { s: "^FCHI", n: "CAC 40 (Francia)", g: "Mundo", pais: "🇫🇷" },
  { s: "^N225", n: "Nikkei 225 (Japón)", g: "Mundo", pais: "🇯🇵" },
  { s: "^HSI", n: "Hang Seng (Hong Kong)", g: "Mundo", pais: "🇭🇰" },
  { s: "000001.SS", n: "Shanghái", g: "Mundo", pais: "🇨🇳" },
  { s: "^NSEI", n: "Nifty 50 (India)", g: "Mundo", pais: "🇮🇳" },
  { s: "^BVSP", n: "Bovespa (Brasil)", g: "Mundo", pais: "🇧🇷" },
  { s: "^MXX", n: "IPC (México)", g: "Mundo", pais: "🇲🇽" },
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

/** Índices contra los que se puede comparar el portafolio y medir la valoración (EE. UU. y mundo). */
export const INDICES_COMPARABLES: Record<string, string> = Object.fromEntries(INSTRUMENTOS.filter((i) => (i.g === "Índices" && i.s !== "^VIX") || i.g === "Mundo").map((i) => [i.s, i.n.replace(/ \(.+\)/, "")]));

export interface Instrumento { symbol: string; nombre: string; grupo: string; pais?: string; tasa: boolean; precio: number; cambio: number | null; ytd: number | null; a1: number | null; serie: PricePoint[] }

const pct = (a?: number, b?: number) => (a && b ? (a / b - 1) * 100 : null);

export function mercados(): Promise<Instrumento[]> {
  return cached("mercados:v2", 5 * 60 * 1000, async () => {
    const out = await Promise.all(
      INSTRUMENTOS.map(async (i): Promise<Instrumento | null> => {
        try {
          const r = await yahooIndex(i.s);
          const c = r.closes1y;
          const anio = new Date().getUTCFullYear();
          const base = [...c].reverse().find((p) => new Date(p.t).getUTCFullYear() < anio)?.c;
          return { symbol: i.s, nombre: i.n, grupo: i.g, pais: "pais" in i ? i.pais : undefined, tasa: "pct" in i, precio: r.price, cambio: r.changePct, ytd: pct(r.price, base), a1: pct(r.price, c[0]?.c), serie: c.filter((_, k) => k % 3 === 0 || k === c.length - 1) };
        } catch {
          return null;
        }
      }),
    );
    return out.filter((x): x is Instrumento => !!x);
  });
}
