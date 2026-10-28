import { NextRequest } from "next/server";
import { resultadosRango } from "@/lib/providers/earnings";
import { leerRanking } from "@/lib/providers/ranking";

/** Resultados entre `desde` y `hasta` (máx. ~3 meses): empresas ≥ $10B o del universo Invirtiendo, con nuestra señal. */
export const maxDuration = 60;
const ok = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export async function GET(req: NextRequest) {
  const desde = ok(req.nextUrl.searchParams.get("desde"));
  const hasta = ok(req.nextUrl.searchParams.get("hasta"));
  if (!desde || !hasta || hasta < desde || Date.parse(hasta) - Date.parse(desde) > 100 * 864e5) return Response.json({ error: "Rango inválido" }, { status: 400 });
  const [res, rk] = await Promise.all([resultadosRango(desde, hasta), leerRanking(400)]);
  const nuestro = new Map(rk.map((r) => [r.ticker, r]));
  const filas = res
    .filter((r) => nuestro.has(r.ticker) || (r.marketCap ?? 0) >= 1e10)
    .map((r) => {
      const n = nuestro.get(r.ticker);
      return { ...r, sector: n?.sector ?? null, senal: n?.senal ?? null, senalKey: n?.senal_key ?? null, mos: n?.mos ?? null, nota: n?.grade ?? null };
    })
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || (b.marketCap ?? 0) - (a.marketCap ?? 0));
  return Response.json(filas, { headers: { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" } });
}
