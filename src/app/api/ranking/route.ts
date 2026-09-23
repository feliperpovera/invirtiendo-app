import { NextRequest } from "next/server";
import { leerRanking } from "@/lib/providers/ranking";

export async function GET(req: NextRequest) {
  const limit = Math.min(50, Math.max(5, Number(req.nextUrl.searchParams.get("n") ?? 20) || 20));
  const filas = await leerRanking(limit);
  return Response.json({ filas, asOf: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
