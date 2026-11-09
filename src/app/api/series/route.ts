import { NextRequest } from "next/server";
import { yahooSerie } from "@/lib/providers/yahoo";
import { pool } from "@/lib/providers/http";
import { normalizeSymbol } from "@/lib/evaluate";
import type { PricePoint } from "@/lib/analysis/types";

/** Serie de precio por periodo para varias acciones a la vez (gráficas 1 a 1 del portafolio). */
const RANGO: Record<string, [string, string, number]> = {
  "1D": ["1d", "5m", 60_000],
  "1S": ["5d", "30m", 5 * 60_000],
  "1M": ["1mo", "1d", 15 * 60_000],
  "3M": ["3mo", "1d", 15 * 60_000],
  "6M": ["6mo", "1d", 15 * 60_000],
  YTD: ["ytd", "1d", 15 * 60_000],
  "1A": ["1y", "1wk", 15 * 60_000],
};

export async function GET(req: NextRequest) {
  const r = RANGO[(req.nextUrl.searchParams.get("rango") ?? "1M").toUpperCase()] ?? RANGO["1M"];
  const symbols = [...new Set((req.nextUrl.searchParams.get("symbols") ?? "").split(",").map(normalizeSymbol).filter((s) => /^[A-Z^][A-Z0-9.\-=^]{0,11}$/.test(s)))].slice(0, 30);
  const out: Record<string, { base: number | null; points: PricePoint[] } | null> = {};
  await pool(symbols, 4, async (s) => {
    try {
      const x = await yahooSerie(s, r[0], r[1], r[2]);
      // Base del % del periodo: cierre anterior en intradía; primer cierre del rango en diario
      out[s] = { base: r[1] === "1d" ? (x.points[0]?.c ?? null) : x.prevClose, points: x.points };
    } catch {
      out[s] = null;
    }
  });
  return Response.json(out, { headers: { "Cache-Control": "s-maxage=60" } });
}
