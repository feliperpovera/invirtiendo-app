import type { NextRequest } from "next/server";
import { leerMovimientos } from "@/lib/providers/portafolioPublico";

/** Compras y ventas de la cuenta (para marcarlas en las gráficas). */
export async function GET(req: NextRequest) {
  const c = req.nextUrl.searchParams.get("cuenta") ?? "principal";
  const m = await leerMovimientos(/^[a-z]{1,12}$/.test(c) ? c : "principal");
  return Response.json(m.map((x) => ({ fecha: x.fecha, ticker: x.ticker, tipo: x.tipo, pct: x.pct_posicion, rent: x.rent_pct })), { headers: { "Cache-Control": "s-maxage=300" } });
}
