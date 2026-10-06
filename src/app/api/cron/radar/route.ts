import { NextRequest } from "next/server";
import { radar13F, radarPelosi, radarTrump, guardarRadar } from "@/lib/providers/radar";

/** Job semanal del Radar del Poder (vercel.json → crons, lunes). Cada persona se guarda por separado: si una fuente falla, las demás se actualizan. */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) return new Response("No autorizado", { status: 401 });
  const tareas = { thiel: () => radar13F("thiel", 1562087), berkshire: () => radar13F("berkshire", 1067983), pelosi: radarPelosi, trump: radarTrump };
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
