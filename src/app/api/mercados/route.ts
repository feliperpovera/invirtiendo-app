import { mercados } from "@/lib/providers/mercados";

/** Cinta y resumen de mercados. `?ligero=1` quita las series (para la cinta del encabezado). */
export async function GET(req: Request) {
  const ligero = new URL(req.url).searchParams.has("ligero");
  const m = await mercados();
  return Response.json(ligero ? m.map(({ serie: _s, ...x }) => x) : m, { headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" } });
}
