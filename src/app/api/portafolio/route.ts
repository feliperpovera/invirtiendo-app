import { NextRequest } from "next/server";
import { yahooSerie } from "@/lib/providers/yahoo";
import type { PricePoint } from "@/lib/analysis/types";
import { INDICES_COMPARABLES } from "@/lib/providers/mercados";
import { cached } from "@/lib/providers/cache";
import { nivelesIbkr, pesosIbkr } from "@/lib/providers/portafolioIbkr";
import { leerPosiciones, leerMovimientos } from "@/lib/providers/portafolioPublico";
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
  const cuenta = req.nextUrl.searchParams.get("cuenta") ?? "principal";
  if (cuenta !== "principal") return otraCuenta(cuenta, rango, indice);
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
    const ultimoOficial = ibkr[ibkr.length - 1].t;
    const hoy = v?.dia ?? aDia(Date.now());
    const anterior = sesionAnterior(sp.sesiones, hoy);
    // Yahoo deja sin cierre la barra de la sesión anterior por horas: se completa con el intradía.
    const spDiario = completarSesion(
      sp.points.map((p) => ({ t: aDia(p.t), c: p.c })),
      anterior,
      v?.spAnterior ?? 0,
    );
    // Si la sincronización de IBKR se atrasó, los días que faltan se estiman con los pesos actuales ×
    // cierres diarios de cada posición: el gráfico nunca se congela (esos días van punteados).
    const serieIbkr = await completarConEstimado(ibkr, spDiario.filter((p) => p.t > ultimoOficial && anterior !== null && p.t <= anterior).map((p) => p.t), pesos);
    const ultimoIbkr = serieIbkr[serieIbkr.length - 1].t;
    const historia = compararHistoria(spDiario, serieIbkr, rango === "MAX" ? serieIbkr[0].t : inicioRango(rango, ultimoIbkr));
    if (!historia) throw new Error("Sin datos suficientes para el periodo");
    const { comp, enVivo } = agregarVivo(historia, ultimoIbkr, anterior, v);
    return responder({ rango, asOf: Date.now(), fuente: "ibkr", hasta: ultimoOficial, estimadoDesde: ultimoIbkr > ultimoOficial ? ultimoOficial : null, enVivo, pesos, ...comp });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}

/** Extiende la serie oficial de IBKR con días estimados (pesos × cierre de cada posición respecto al último día oficial). */
async function completarConEstimado(ibkr: PricePoint[], dias: number[], pesos: Array<{ ticker: string; peso: number }>): Promise<PricePoint[]> {
  if (!dias.length) return ibkr;
  const series = await Promise.all(pesos.map((p) => yahooSerie(p.ticker, "3mo", "1d", 15 * MINUTO).catch(() => null)));
  const cierre = (k: number, t: number) => {
    let c: number | null = null;
    for (const p of series[k]?.points ?? []) if (aDia(p.t) <= t) c = p.c;
    return c;
  };
  const ult = ibkr[ibkr.length - 1];
  const extra: PricePoint[] = [];
  for (const d of dias) {
    let num = 0, den = 0;
    pesos.forEach((p, k) => {
      const a = cierre(k, ult.t), b = cierre(k, d);
      if (a && b) {
        num += p.peso * (b / a);
        den += p.peso;
      }
    });
    if (den) extra.push({ t: d, c: (ult.c * num) / den });
  }
  return [...ibkr, ...extra];
}

/** Medio minuto en el CDN: la portada pide cada minuto y el punto "ahora" no debe quedar viejo. */
const responder = (data: object) => Response.json(data, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" } });

/** Fecha de arranque de cada cuenta sin historia diaria del bróker. */
const FUNDACION: Record<string, string> = { inv: "2010-10-01" };

/**
 * GA e INV no tienen serie diaria del bróker: se simula la cuenta con las cantidades actuales × cierre de
 * cada día (como si se hubieran tenido siempre), desde la fundación o la primera compra registrada.
 * ponytail: no refleja compras/ventas intermedias; reemplazar por la historia real si el bróker la da.
 */
async function otraCuenta(cuenta: string, rango: Rango, indice: string) {
  if (!/^[a-z]{1,12}$/.test(cuenta)) return Response.json({ error: "cuenta" }, { status: 400 });
  try {
    const data = await cached(`portafolio:${cuenta}:${rango}:${indice}`, 15 * MINUTO, async () => {
      const [pos, mov] = await Promise.all([leerPosiciones(cuenta), leerMovimientos(cuenta)]);
      const tenencias = pos.filter((p) => p.cantidad);
      if (!tenencias.length) throw new Error("La cuenta no tiene posiciones");
      const pesos = pos.map((p) => ({ ticker: p.ticker, peso: Number(p.peso) }));
      const fundacion = Date.parse(`${FUNDACION[cuenta] ?? mov.at(-1)?.fecha ?? "2000-01-01"}T00:00:00Z`);
      // Más de 5 años de historia: barras semanales (menos CPU en Cloudflare)
      const largo = rango === "MAX" ? Date.now() - fundacion > 5 * 365 * 864e5 : RANGOS[rango].meses > 60;
      const [r, iv] = largo ? ["max", "1wk"] : rango === "1D" ? ["1d", "5m"] : ["5y", "1d"];
      const [sp, ...series] = await Promise.all([indice, ...tenencias.map((p) => p.ticker)].map((t) => yahooSerie(t, r, iv, 15 * MINUTO)));
      const dia = (t: number) => (rango === "1D" ? t : aDia(t));
      const spPts = sp.points.map((p) => ({ t: dia(p.t), c: p.c }));
      // Valor de la cuenta en cada fecha del índice; arranca cuando todas las posiciones ya cotizaban
      const desde = Math.max(rango === "1D" ? 0 : fundacion, ...series.map((x) => dia(x.points[0]?.t ?? Infinity)));
      const idx = series.map(() => -1);
      const valores: PricePoint[] = [];
      for (const p of spPts) {
        if (p.t < desde) continue;
        let v = 0;
        series.forEach((x, k) => {
          while (idx[k] + 1 < x.points.length && dia(x.points[idx[k] + 1].t) <= p.t) idx[k]++;
          if (idx[k] >= 0) v += Number(tenencias[k].cantidad) * x.points[idx[k]].c;
        });
        if (v > 0) valores.push({ t: p.t, c: v });
      }
      if (valores.length < 2) throw new Error("Sin datos suficientes para el periodo");
      const ultimo = valores[valores.length - 1].t;
      const inicio = rango === "MAX" ? valores[0].t : rango === "1D" ? valores[0].t : inicioRango(rango, ultimo);
      const comp = compararHistoria(spPts, valores, inicio);
      if (!comp) throw new Error("Sin datos suficientes para el periodo");
      return { pesos, ...comp };
    });
    return responder({ rango, asOf: Date.now(), fuente: "simulado", hasta: null, enVivo: false, ...data });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
