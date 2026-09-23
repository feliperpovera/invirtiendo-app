import { NextRequest } from "next/server";
import { evaluate, evaluateCached, EvaluationError } from "@/lib/evaluate";
import { guardarRanking } from "@/lib/providers/ranking";

export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await ctx.params;
  const fresh = req.nextUrl.searchParams.get("fresh") === "1";
  try {
    const ev = fresh ? await evaluate(ticker) : await evaluateCached(ticker);
    await guardarRanking(ev);
    return Response.json(ev, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof EvaluationError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "ETF" ? 422 : 502;
      return Response.json({ error: e.message, code: e.code, extra: e.extra ?? null }, { status });
    }
    const msg = e instanceof Error ? e.message : "error";
    return Response.json({ error: msg, code: "UPSTREAM" }, { status: 502 });
  }
}
