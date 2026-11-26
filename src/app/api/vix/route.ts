import type { NextRequest } from "next/server";
import { yahooSerie } from "@/lib/providers/yahoo";

/** VIX diario de ~20 años (cierre, máximo y mínimo de cada día) + sus picos más altos (uno por episodio, separados ≥ 6 meses). */
export async function GET(req: NextRequest) {
  try {
    // ?solo=1: solo el último valor (para el aviso de toda la página), liviano y fresco
    if (req.nextUrl.searchParams.get("solo")) {
      const u = (await yahooSerie("^VIX", "5d", "1d", 5 * 60_000)).points.filter((p) => p.c > 0).at(-1);
      return Response.json({ actual: u?.c ?? null, t: u?.t ?? null }, { headers: { "Cache-Control": "s-maxage=300" } });
    }
    const s = await yahooSerie("^VIX", "20y", "1d", 3600_000);
    const r2 = (v: number) => Math.round(v * 100) / 100;
    // Compacto: [t, cierre, máximo, mínimo] por día
    const dias = s.points.filter((p) => p.c > 0).map((p) => [p.t, r2(p.c), r2(p.h ?? p.c), r2(p.l ?? p.c)] as const);
    const picos: Array<{ t: number; v: number }> = [];
    for (const [t, , h] of [...dias].sort((a, b) => b[2] - a[2])) {
      if (picos.length >= 8) break;
      if (picos.every((q) => Math.abs(q.t - t) > 182 * 864e5)) picos.push({ t, v: h });
    }
    return Response.json({ actual: dias.at(-1)?.[1] ?? null, dias, picos }, { headers: { "Cache-Control": "s-maxage=900" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
