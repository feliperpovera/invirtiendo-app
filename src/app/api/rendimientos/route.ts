import { NextRequest } from "next/server";
import { yahooIndex } from "@/lib/providers/yahoo";
import { pool } from "@/lib/providers/http";
import { normalizeSymbol } from "@/lib/evaluate";

/**
 * Rendimiento por periodo de cada símbolo (como la franja de TradingView): hoy, 1 semana, 1 mes, 3 y 6 meses, año.
 * Precio de este momento (caché de 1 min de `yahooIndex`) contra el cierre de hace N días hábiles.
 */
export interface Rendimiento { precio: number; hoy: number | null; s1: number | null; m1: number | null; m3: number | null; m6: number | null; ytd: number | null; a1: number | null }

export async function GET(req: NextRequest) {
  const symbols = [...new Set((req.nextUrl.searchParams.get("symbols") ?? "").split(",").map(normalizeSymbol).filter((s) => /^[A-Z^][A-Z0-9.\-=^]{0,11}$/.test(s)))].slice(0, 40);
  const out: Record<string, Rendimiento | null> = {};
  await pool(symbols, 4, async (s) => {
    try {
      const r = await yahooIndex(s);
      const c = r.closes1y;
      const hace = (dias: number) => {
        const t = Date.now() - dias * 864e5;
        const p = [...c].reverse().find((x) => x.t <= t);
        return p ? (r.price / p.c - 1) * 100 : null;
      };
      const anio = new Date().getUTCFullYear();
      const base = [...c].reverse().find((p) => new Date(p.t).getUTCFullYear() < anio)?.c;
      out[s] = { precio: r.price, hoy: r.changePct, s1: hace(7), m1: hace(30), m3: hace(91), m6: hace(182), ytd: base ? (r.price / base - 1) * 100 : null, a1: c[0] ? (r.price / c[0].c - 1) * 100 : null };
    } catch {
      out[s] = null;
    }
  });
  return Response.json(out, { headers: { "Cache-Control": "s-maxage=60" } });
}
