// Descarga la evaluación de cada acción a un archivo, con lo relevante para auditar el Fair Value.
import { writeFileSync, mkdirSync } from "node:fs";
const OUT = process.argv[2];
const list = process.argv[3].split(",");
mkdirSync(OUT, { recursive: true });
const r = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
let ok = 0, fail = 0;
const cola = [...list];
async function uno(t) {
  try {
    const d = await (await fetch(`http://localhost:3000/api/stock/${t}?fresh=1`)).json();
    if (d.error) { console.log(t, "ERROR", String(d.error).slice(0, 60)); fail++; return; }
    const v = d.valuation, m = d.metrics, L = v.lynch, f = d.fvHistory;
    const slim = {
      ticker: t, nombre: d.profile.name, industria: d.profile.industry, sector: d.profile.sector,
      precio: r(d.quote.price), capitalizacion: r(m.marketCap), ciclica: d.risk.cyclical,
      fairValue: r(v.intrinsic.blended), marginOfSafety: r(v.marginOfSafety), senal: d.score.signal.label,
      metodo: v.method, razonMetodo: v.methodReason,
      modelo: { eps: r(L.eps), fuenteEps: L.epsSource, crecimiento: r(L.growth), dividendo: r(L.dividendYield), primaCalidad: r(L.qualityBonus), peJusto: r(L.fairPe), topePe: L.capPe },
      insumosCrecimiento: Object.fromEntries(Object.entries(v.growthInputs ?? {}).map(([k, x]) => [k, r(x)])),
      datosReales: {
        epsTTM: r(m.epsTTM), epsForward: r(m.epsForward), pe: r(m.pe), forwardPe: r(m.forwardPe), peg: r(v.multiples.peg),
        peProm5a: r(v.multiples.peAvg5y), ps: r(m.ps), pb: r(m.pb), evEbitda: r(m.evEbitda), fcfYield: r(v.multiples.fcfYield),
        margenBruto: r(m.grossMargin), margenOperativo: r(m.operatingMargin), margenNeto: r(m.netMargin),
        roe: r(m.roe), roic: r(m.roic), deudaPatrimonio: r(m.debtToEquity), dividendo: r(m.dividendYield),
        crecIngresosTTM: r(m.revenueGrowthTTM), crecIngresos5a: r(m.revenueGrowth5Y), crecEps5a: r(m.epsGrowth5Y),
        objetivoAnalistas: r(m.analystTarget), beta: r(m.beta),
      },
      contraste: { dcf: r(v.intrinsic.dcf), peHistorico: r(v.intrinsic.historicalPe), graham: r(v.intrinsic.graham), porVentas: r(v.sales?.value), porLibros: r(v.book?.value) },
      ventas: v.sales ? { ventasPorAccion: r(v.sales.revenuePerShare), margenObjetivo: r(v.sales.targetMargin), psJustificado: r(v.sales.justifiedPs) } : null,
      epsAnual: d.fundamentals.annual.slice(-8).map((x) => ({ anio: x.fy, eps: r(x.epsDiluted), ingresos: r(x.revenue), utilidad: r(x.netIncome), margen: x.revenue ? r((x.netIncome / x.revenue) * 100) : null })),
      grafico: f ? { puntos: f.points.length, ultimo: r(f.points.at(-1)?.fv), fairValueHoy: r(f.fairValueNow), objetivo12m: r(f.targetOwn) } : null,
      avisos: v.notes, advertencias: d.warnings,
    };
    writeFileSync(`${OUT}/${t}.json`, JSON.stringify(slim, null, 1));
    ok++;
  } catch (e) { console.log(t, "FALLO", String(e).slice(0, 60)); fail++; }
}
await Promise.all(Array.from({ length: 4 }, async () => { while (cola.length) await uno(cola.shift()); }));
console.log(`descargadas ${ok} · fallidas ${fail}`);
