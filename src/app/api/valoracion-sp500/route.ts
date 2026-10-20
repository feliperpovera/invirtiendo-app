import { yahooSerie } from "@/lib/providers/yahoo";
import { cached } from "@/lib/providers/cache";
import { calcularValoracion, zona } from "@/lib/analysis/valoracionSP";
import { INDICES_COMPARABLES } from "@/lib/providers/mercados";

/** Indicador de valoración del S&P 500 (último año) + lectura actual. El último cierre diario es el precio de este momento. */
// Cada índice con su propio "VIX": VXN (Nasdaq-100), VXD (Dow), RVX (Russell 2000)
const VOL: Record<string, string> = { "^GSPC": "^VIX", "^NDX": "^VXN", "^DJI": "^VXD", "^RUT": "^RVX" };

export async function GET(req: Request) {
  const pedido = new URL(req.url).searchParams.get("symbol") ?? "^GSPC";
  const symbol = pedido in INDICES_COMPARABLES ? pedido : "^GSPC";
  try {
    const data = await cached(`valoracion:v2:${symbol}`, 10 * 60_000, async () => {
      const [sp, vix] = await Promise.all([yahooSerie(symbol, "5y", "1d", 10 * 60_000), yahooSerie(VOL[symbol] ?? "^VIX", "5y", "1d", 10 * 60_000).catch(() => yahooSerie("^VIX", "5y", "1d", 10 * 60_000))]);
      const serie = calcularValoracion(sp.points, vix.points);
      const ult = serie[serie.length - 1];
      return { symbol, volatilidad: VOL[symbol] ?? "^VIX", asOf: Date.now(), actual: { ...ult, zona: zona(ult.nivel) }, serie: serie.slice(-260) };
    });
    return Response.json(data, { headers: { "Cache-Control": "s-maxage=300" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
