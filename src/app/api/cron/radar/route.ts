import { NextRequest } from "next/server";
import { radar13F, radarPelosi, radarTrump, guardarRadar, FONDOS } from "@/lib/providers/radar";

/** Job semanal del Radar del Poder (.github/workflows/tareas.yml, lunes). Cada persona se guarda por separado: si una fuente falla, las demás se actualizan. */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) return new Response("No autorizado", { status: 401 });
  const todas: Record<string, () => ReturnType<typeof radarPelosi>> = { pelosi: radarPelosi, trump: radarTrump, ...Object.fromEntries(FONDOS.map((f) => [f.persona, () => radar13F(f.persona, f.cik)])) };
  // `persona=x`: una sola por llamada (Cloudflare gratis limita las llamadas externas por invocación)
  const una = req.nextUrl.searchParams.get("persona");
  const tareas = una ? (todas[una] ? { [una]: todas[una] } : {}) : todas;
  const res = await Promise.all(
    Object.entries(tareas).map(async ([k, f]) => {
      try {
        const p = await f();
        await guardarRadar(p);
        return [k, `ok · ${p.compras.length} compras · ${p.ventas.length} ventas`];
      } catch (e) {
        return [k, `error: ${e instanceof Error ? e.message : e}`];
      }
    }),
  );
  return Response.json(Object.fromEntries(res));
}
