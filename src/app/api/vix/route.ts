import { yahooSerie } from "@/lib/providers/yahoo";

/** VIX semanal de ~20 años + sus picos más altos (máximo intradía, uno por episodio, separados ≥ 6 meses). */
export async function GET() {
  try {
    const s = await yahooSerie("^VIX", "20y", "1wk", 6 * 3600_000);
    const pts = s.points.map((p) => ({ t: p.t, c: p.c, h: p.h ?? p.c }));
    const picos: Array<{ t: number; v: number }> = [];
    for (const p of [...pts].sort((a, b) => b.h - a.h)) {
      if (picos.length >= 8) break;
      if (picos.every((q) => Math.abs(q.t - p.t) > 182 * 864e5)) picos.push({ t: p.t, v: p.h });
    }
    return Response.json({ actual: pts.at(-1)?.c ?? null, puntos: pts.map(({ t, c }) => ({ t, c })), picos }, { headers: { "Cache-Control": "s-maxage=3600" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
