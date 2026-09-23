import { NextRequest } from "next/server";
import { yahooSearch } from "@/lib/providers/yahoo";
import { finnhubEnabled, finnhubSearch } from "@/lib/providers/finnhub";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) return Response.json({ hits: [] });
  try {
    let hits = await yahooSearch(q);
    if (!hits.length && finnhubEnabled()) hits = await finnhubSearch(q);
    // Prioriza acciones de bolsas de EE. UU.
    const us = /NASDAQ|NYSE|NYSEArca|BATS|US|AMEX/i;
    hits.sort((a, b) => Number(us.test(b.exchange)) - Number(us.test(a.exchange)));
    return Response.json({ hits: hits.slice(0, 8) }, { headers: { "Cache-Control": "public, max-age=3600" } });
  } catch (e) {
    return Response.json({ hits: [], error: e instanceof Error ? e.message : "error" }, { status: 200 });
  }
}
