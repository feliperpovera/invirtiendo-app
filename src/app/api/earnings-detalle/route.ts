import { yahooSummary } from "@/lib/providers/yahoo";
import { normalizeSymbol } from "@/lib/evaluate";

/** Lo que el mercado mira en cada sector cuando una empresa reporta. */
const CLAVE: Record<string, string> = {
  Technology: "Crecimiento de ingresos y guía (guidance) del próximo trimestre; en IA, demanda de centros de datos",
  "Communication Services": "Usuarios, ingresos por publicidad y gasto en IA (capex)",
  "Consumer Cyclical": "Ventas comparables, márgenes e inventarios",
  "Consumer Defensive": "Volumen frente a precio y márgenes brutos",
  Healthcare: "Ventas de sus productos clave y avances del pipeline",
  "Financial Services": "Margen de interés neto, provisiones de crédito y comisiones",
  Industrials: "Cartera de pedidos (backlog), márgenes y guía anual",
  Energy: "Producción, precio realizado y flujo de caja libre",
  Utilities: "Guía de utilidades, tarifas y demanda eléctrica",
  "Real Estate": "FFO por acción y ocupación",
  "Basic Materials": "Precios, volúmenes y costos de insumos",
};

/** Detalle de resultados de una empresa: ingresos estimados, crecimiento esperado y el indicador clave de su sector. */
export async function GET(req: Request) {
  const s = normalizeSymbol(new URL(req.url).searchParams.get("symbol") ?? "");
  if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)) return Response.json({ error: "Símbolo inválido" }, { status: 400 });
  try {
    const y = await yahooSummary(s);
    return Response.json(
      {
        sector: y.sector ?? null,
        ingresosEstimados: y.nextEarnings.revenueEstimate,
        epsEstimado: y.nextEarnings.epsEstimate,
        crecIngresosAnio: y.estimates.revG0,
        crecEpsAnio: y.estimates.epsG0,
        margenOperativo: y.operatingMargin,
        clave: CLAVE[y.sector ?? ""] ?? "Ingresos, utilidades y guía del próximo trimestre",
      },
      { headers: { "Cache-Control": "s-maxage=3600" } },
    );
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
