import type { AnnualRow, PricePoint } from "./types";
import type { EpsAnual } from "@/lib/providers/nasdaq";
import { isNum } from "@/lib/format";

type N = number | null;
/** Una columna de la tabla "Pasado y consenso": año fiscal reportado (estimado=false) o pronóstico de analistas. */
export interface ConsensoFila {
  fy: number;
  end: string | null;
  estimado: boolean;
  revenue: N;
  revLow: N;
  revHigh: N;
  revN: N;
  revGrowth: N;
  eps: N;
  epsLow: N;
  epsHigh: N;
  epsN: N;
  epsGrowth: N;
  ps: N;
  pe: N;
}
type Rango = { rev: N; revLow: N; revHigh: N; revN: N; eps: N; epsLow: N; epsHigh: N; epsN: N };

const crec = (a: N, b: N) => (isNum(a) && isNum(b) && b > 0 ? ((a - b) / b) * 100 : null);

/**
 * Histórico de 5 años (10-K) + consenso: Yahoo da ingresos y EPS de este año y el próximo con rango;
 * Nasdaq da EPS hasta 4 años. Más allá de +1 año no hay consenso de ingresos gratuito: queda en blanco.
 * P/S y P/E del pasado usan el precio al cierre fiscal; los del futuro, el precio de hoy.
 * `usd=false` (estados en otra moneda, ej. TSMC): se omiten P/S y P/E del pasado para no mezclar monedas.
 */
export function buildConsenso(o: { annual: AnnualRow[]; yahoo?: Rango[]; nasdaq: EpsAnual[]; price: number; shares: N; monthly: PricePoint[]; usd: boolean }): ConsensoFila[] {
  const pasado = o.annual.filter((r) => isNum(r.revenue) || isNum(r.epsDiluted)).slice(-5);
  const ultimo = pasado.at(-1)?.fy ?? new Date().getFullYear() - 1;
  const precioEn = (end: string) => {
    const t = Date.parse(end);
    let p: number | null = null;
    for (const x of o.monthly) if (x.t <= t + 20 * 864e5) p = x.c;
    return p;
  };
  const filas: ConsensoFila[] = pasado.map((r) => {
    const p = o.usd ? precioEn(r.end) : null;
    return {
      fy: r.fy, end: r.end, estimado: false,
      revenue: r.revenue, revLow: null, revHigh: null, revN: null, revGrowth: null,
      eps: r.epsDiluted, epsLow: null, epsHigh: null, epsN: null, epsGrowth: null,
      ps: isNum(p) && isNum(r.sharesDiluted) && isNum(r.revenue) && r.revenue > 0 ? (p * r.sharesDiluted) / r.revenue : null,
      pe: isNum(p) && isNum(r.epsDiluted) && r.epsDiluted > 0 ? p / r.epsDiluted : null,
    };
  });
  // El año "0y" de Yahoo es el primero de Nasdaq; sin Nasdaq, el año siguiente al último reportado.
  const y0 = o.nasdaq.length ? Number(o.nasdaq[0].fiscalEnd.slice(-4)) : ultimo + 1;
  const futuros = new Map<number, ConsensoFila>();
  const fila = (fy: number, end: string | null) =>
    futuros.get(fy) ?? futuros.set(fy, { fy, end, estimado: true, revenue: null, revLow: null, revHigh: null, revN: null, revGrowth: null, eps: null, epsLow: null, epsHigh: null, epsN: null, epsGrowth: null, ps: null, pe: null }).get(fy)!;
  o.nasdaq.forEach((e) => Object.assign(fila(Number(e.fiscalEnd.slice(-4)), e.fiscalEnd), { eps: e.eps, epsLow: e.low, epsHigh: e.high, epsN: e.n }));
  (o.yahoo ?? []).forEach((y, i) => {
    if (!isNum(y.rev) && !isNum(y.eps)) return;
    const f = fila(y0 + i, null);
    Object.assign(f, { revenue: y.rev, revLow: y.revLow, revHigh: y.revHigh, revN: y.revN });
    if (!isNum(f.eps)) Object.assign(f, { eps: y.eps, epsLow: y.epsLow, epsHigh: y.epsHigh, epsN: y.epsN });
  });
  const todas = [...filas, ...[...futuros.values()].filter((f) => f.fy > ultimo).sort((a, b) => a.fy - b.fy)];
  todas.forEach((f, i) => {
    const prev = todas[i - 1];
    f.revGrowth = crec(f.revenue, prev?.revenue ?? null);
    f.epsGrowth = crec(f.eps, prev?.eps ?? null);
    if (f.estimado) {
      f.ps = isNum(o.shares) && isNum(f.revenue) && f.revenue > 0 ? (o.price * o.shares) / f.revenue : null;
      f.pe = isNum(f.eps) && f.eps > 0 ? o.price / f.eps : null;
    }
  });
  return todas;
}

// ponytail: autocomprobación mínima — `npx tsx src/lib/analysis/consenso.ts`
if (typeof process !== "undefined" && process.argv[1]?.endsWith("consenso.ts")) {
  const r = buildConsenso({
    annual: [{ fy: 2026, end: "2026-01-25", revenue: 200, epsDiluted: 4, sharesDiluted: 10 } as AnnualRow],
    yahoo: [{ rev: 400, revLow: 390, revHigh: 410, revN: 40, eps: 9, epsLow: 8, epsHigh: 10, epsN: 33 }],
    nasdaq: [{ fiscalEnd: "Jan 2027", eps: 9.25, high: 9.7, low: 9, n: 17 }, { fiscalEnd: "Jan 2028", eps: 15, high: 17, low: 12, n: 16 }],
    price: 100, shares: 10, monthly: [{ t: Date.parse("2026-01-20"), c: 80 }], usd: true,
  });
  console.assert(r.length === 3 && r[1].fy === 2027 && r[1].eps === 9.25 && r[1].revenue === 400 && r[2].revenue === null, "filas");
  console.assert(r[0].pe === 20 && r[1].revGrowth === 100 && r[1].pe === 100 / 9.25, "múltiplos");
  console.log("consenso ok");
}
