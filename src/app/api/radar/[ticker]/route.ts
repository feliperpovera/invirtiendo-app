import { leerRadar } from "@/lib/providers/radar";

/** Lo que el Radar del Poder sabe de una acción: quién la tiene, compró o vendió, y cuándo. */
export async function GET(_: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const t = (await params).ticker.toUpperCase();
  const out = (await leerRadar()).flatMap((p) => {
    const pos = p.posiciones.find((x) => x.ticker === t);
    const c = p.compras.find((x) => x.ticker === t);
    const v = p.ventas.find((x) => x.ticker === t);
    if (!pos && !c && !v) return [];
    return [{ persona: p.persona, periodo: p.periodo, trece: p.posiciones.length > 0 || /13F/.test(p.periodo), posicion: pos ?? null, compra: c ?? null, venta: v ?? null }];
  });
  return Response.json(out, { headers: { "Cache-Control": "s-maxage=3600" } });
}
