import { yahooEtf, yahooQuote } from "@/lib/providers/yahoo";
import { evaluarEtf } from "@/lib/analysis/etf";
import { cached } from "@/lib/providers/cache";
import { normalizeSymbol } from "@/lib/evaluate";

export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  const symbol = normalizeSymbol(ticker);
  try {
    const ev = await cached(`etfeval:${symbol}`, 10 * 60 * 1000, async () => {
      const [profile, quote] = await Promise.all([yahooEtf(symbol), yahooQuote(symbol)]);
      return evaluarEtf(profile, quote);
    });
    return Response.json(ev, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    const notFound = /404|sin datos/i.test(msg);
    return Response.json({ error: notFound ? `No encontré datos de fondo para ${symbol}. Revisa el símbolo o prueba otro ETF.` : msg }, { status: notFound ? 404 : 502 });
  }
}
