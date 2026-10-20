import { NextRequest } from "next/server";
import { yahooSerie } from "@/lib/providers/yahoo";
import { INDICES_COMPARABLES } from "@/lib/providers/mercados";
import { cached } from "@/lib/providers/cache";
import { nivelesIbkr, pesosIbkr } from "@/lib/providers/portafolioIbkr";
import {
  aDia,
  agregarVivo,
  compararConIndice,
  compararHistoria,
  completarSesion,
  inicioRango,
  sesionAnterior,
  RANGOS,
  type Rango,
  type Serie,
  type Vivo,
} from "@/lib/analysis/portafolio";

/**
 * Portafolio Invirtiendoo (cuenta real en IBKR) contra el S&P 500: `GET /api/portafolio?rango=YTD`.
 * - Históricos: rendimiento ponderado por tiempo de IBKR hasta su último cierre, más un punto
 *   "ahora" con los pesos de las posiciones × precio actual. Se refresca cada minuto.
 * - `1D`: la sesión de hoy completa, estimada con los mismos pesos.
 */
const MINUTO = 60_000;

/** Intradía de hoy (5 min) del S&P y de cada posición. Yahoo corta las ráfagas: de a cuatro. */
async function intradia(tickers: string[]): Promise<Array<Serie | null>> {
  const una = async (s: string): Promise<Serie | null> => {
    try {
      const r = await yahooSerie(s, "1d", "5m", MINUTO);
      return r.points.length ? { points: r.points, base: r.prevClose } : null;
    } catch {
      return null;
    }
  };
  const out: Array<Serie | null> = [];
  for (let i = 0; i < tickers.length; i += 4) out.push(...(await Promise.all(tickers.slice(i, i + 4).map(una))));
  return out;
}

/** El punto "ahora", compartido por todos los periodos y recalculado cada minuto. */
function vivo(indice: string): Promise<Vivo | null> {
  return cached(`portafolio:vivo:${indice}`, MINUTO, async () => {
    const pesos = await pesosIbkr();
    const [sp, ...pos] = await intradia([indice, ...pesos.map((p) => p.ticker)]);
    if (!sp?.base) return null;
    let valor = 0;
    let peso = 0;
    pesos.forEach((p, i) => {
      const s = pos[i];
      if (s?.base) {
        valor += p.peso * (s.points[s.points.length - 1].c / s.base);
        peso += p.peso;
      }
    });
    if (!peso) return null;
    const ultimo = sp.points[sp.points.length - 1];
    return { t: ultimo.t, dia: aDia(sp.points[0].t), spAnterior: sp.base, spAhora: ultimo.c, factor: valor / peso };
  });
}

export async function GET(req: NextRequest) {
  const pedido = (req.nextUrl.searchParams.get("rango") ?? "YTD").toUpperCase();
  const rango: Rango = pedido in RANGOS ? (pedido as Rango) : "YTD";
  // Índice de comparación: S&P 500 por defecto; también Nasdaq-100, Dow Jones y Russell 2000
  const pedidoIdx = req.nextUrl.searchParams.get("indice") ?? "^GSPC";
  const indice = pedidoIdx in INDICES_COMPARABLES ? pedidoIdx : "^GSPC";
  try {
    const pesos = await pesosIbkr();

    if (rango === "1D") {
      const data = await cached(`portafolio:ibkr:1D:${indice}`, MINUTO, async () => {
        const [serieIdx, ...resto] = await intradia([indice, ...pesos.map((p) => p.ticker)]);
        if (!serieIdx) throw new Error("Sin datos del índice");
        const comp = compararConIndice(serieIdx, pesos.map((p, i) => ({ ticker: p.ticker, peso: p.peso, serie: resto[i] })));
        if (!comp) throw new Error("Sin datos de hoy");
        return comp;
      });
      return responder({ rango, asOf: Date.now(), fuente: "estimado", hasta: null, enVivo: true, pesos, ...data });
    }

    // La historia (IBKR + S&P diario) cambia una vez al día: 15 minutos de caché.
    const [ibkr, sp, v] = await Promise.all([
      nivelesIbkr(),
      yahooSerie(indice, "5y", "1d", 15 * MINUTO),
      vivo(indice).catch(() => null),
    ]);
    if (ibkr.length < 2) throw new Error("Todavía no hay historia de IBKR");
    const ultimoIbkr = ibkr[ibkr.length - 1].t;
    const hoy = v?.dia ?? aDia(Date.now());
    const anterior = sesionAnterior(sp.sesiones, hoy);
    // Yahoo deja sin cierre la barra de la sesión anterior por horas: se completa con el intradía.
    const spDiario = completarSesion(
      sp.points.map((p) => ({ t: aDia(p.t), c: p.c })),
      anterior,
      v?.spAnterior ?? 0,
    );
    const historia = compararHistoria(spDiario, ibkr, inicioRango(rango, ultimoIbkr));
    if (!historia) throw new Error("Sin datos suficientes para el periodo");
    const { comp, enVivo } = agregarVivo(historia, ultimoIbkr, anterior, v);
    return responder({ rango, asOf: Date.now(), fuente: "ibkr", hasta: ultimoIbkr, enVivo, pesos, ...comp });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}

/** Medio minuto en el CDN: la portada pide cada minuto y el punto "ahora" no debe quedar viejo. */
const responder = (data: object) => Response.json(data, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } });
