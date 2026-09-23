import { NextRequest } from "next/server";
import { yahooQuote } from "@/lib/providers/yahoo";
import { finnhubEnabled, finnhubQuote } from "@/lib/providers/finnhub";
import { pool } from "@/lib/providers/http";
import { normalizeSymbol } from "@/lib/evaluate";
import type { Quote } from "@/lib/analysis/types";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = [...new Set(raw.split(",").map(normalizeSymbol).filter((s) => /^[A-Z][A-Z0-9.\-^]{0,9}$/.test(s)))].slice(0, 40);
  if (!symbols.length) return Response.json({ quotes: {} });
  const quotes: Record<string, Quote | null> = {};
  await pool(symbols, 4, async (s) => {
    try {
      const y = await yahooQuote(s);
      if (finnhubEnabled()) {
        try {
          const f = await finnhubQuote(s);
          quotes[s] = { ...y, price: f.price, change: f.change, changePct: f.changePct, prevClose: f.prevClose, asOf: Math.max(f.asOf, y.asOf), source: "finnhub", delayed: false };
          return;
        } catch {
          /* fallback yahoo */
        }
      }
      quotes[s] = y;
    } catch {
      quotes[s] = null;
    }
  });
  return Response.json({ quotes, asOf: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
