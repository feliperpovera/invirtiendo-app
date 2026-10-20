import { yahooSerie } from "@/lib/providers/yahoo";
import { cached } from "@/lib/providers/cache";
import { calcularValoracion, zona } from "@/lib/analysis/valoracionSP";

/** Indicador de valoración del S&P 500 (último año) + lectura actual. El último cierre diario es el precio de este momento. */
export async function GET() {
  try {
    const data = await cached("valoracion-sp500:v2", 10 * 60_000, async () => {
      const [sp, vix] = await Promise.all([yahooSerie("^GSPC", "5y", "1d", 10 * 60_000), yahooSerie("^VIX", "5y", "1d", 10 * 60_000)]);
      const serie = calcularValoracion(sp.points, vix.points);
      const ult = serie[serie.length - 1];
      return { asOf: Date.now(), actual: { ...ult, zona: zona(ult.nivel) }, serie: serie.slice(-260) };
    });
    return Response.json(data, { headers: { "Cache-Control": "s-maxage=300" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
