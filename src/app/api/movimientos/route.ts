import { leerMovimientos } from "@/lib/providers/portafolioPublico";

/** Compras y ventas de la cuenta (para marcarlas en las gráficas). */
export async function GET() {
  const m = await leerMovimientos();
  return Response.json(m.map((x) => ({ fecha: x.fecha, ticker: x.ticker, tipo: x.tipo, pct: x.pct_posicion, rent: x.rent_pct })), { headers: { "Cache-Control": "s-maxage=300" } });
}
