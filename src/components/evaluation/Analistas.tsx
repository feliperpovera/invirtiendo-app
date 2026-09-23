import type { ValuationResult, SentimentResult } from "@/lib/analysis/types";
import { Card, Eyebrow } from "@/components/ui";
import { fmtMoney, fmtPct, fmtBig, isNum } from "@/lib/format";

/** Qué esperan los analistas: crecimiento de este año y el próximo, objetivo y recomendación. Solo consenso, sin opinión propia. */
export function AnalistasCard({ v, s, price }: { v: ValuationResult; s: SentimentResult; price: number }) {
  const f = v.forward;
  const a = s.analyst;
  const upside = isNum(f.targetMean) ? ((f.targetMean - price) / price) * 100 : null;
  const fila = (label: string, esteAnio: string, proximo: string, g0: number | null, g1: number | null) => (
    <tr key={label}>
      <td className="font-medium">{label}</td>
      <td className="num">
        {esteAnio}
        <div className="text-xs" style={{ color: isNum(g0) && g0 >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>{fmtPct(g0, 0, true)}</div>
      </td>
      <td className="num">
        {proximo}
        <div className="text-xs" style={{ color: isNum(g1) && g1 >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>{fmtPct(g1, 0, true)}</div>
      </td>
    </tr>
  );
  return (
    <Card>
      <Eyebrow>Qué esperan los analistas</Eyebrow>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-2">
        <div className="scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Consenso</th>
                <th className="num">Este año</th>
                <th className="num">Próximo año</th>
              </tr>
            </thead>
            <tbody>
              {fila("Ingresos", fmtBig(f.revenueThisYear, 1), fmtBig(f.revenueNextYear, 1), f.revGrowthThisYear, f.revGrowthNextYear)}
              {fila("Utilidad por acción", fmtMoney(f.epsThisYear), fmtMoney(f.epsNextYear), f.epsGrowthThisYear, f.epsGrowthNextYear)}
            </tbody>
          </table>
          <p className="text-xs text-ink-soft mt-2">
            Forward P/E {isNum(v.multiples.forwardPe) ? `${v.multiples.forwardPe.toFixed(1)}x` : "—"} sobre el EPS del próximo año frente a {fmtPct(f.growthUsed, 0)} de crecimiento esperado. La regla del método: el múltiplo no debería pasar del crecimiento.
          </p>
          {f.valueTrap && <p className="text-xs mt-2 rounded-xl px-3 py-2" style={{ background: "var(--terracotta-tint)", color: "var(--terracotta-deep)" }}>Riesgo de trampa de valor: crece poco y desacelera frente a su propia historia.</p>}
        </div>
        <div>
          <p className="text-[0.7rem] uppercase tracking-[0.12em] font-bold text-ink-soft">Precio objetivo promedio</p>
          <p className="num font-display text-3xl leading-none mt-1">
            {fmtMoney(f.targetMean)} <span className="text-base font-sans" style={{ color: isNum(upside) && upside >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>{fmtPct(upside, 0, true)}</span>
          </p>
          <p className="text-xs text-ink-soft mt-1">
            {isNum(f.analystCount) ? `${f.analystCount} analistas · ` : ""}rango {fmtMoney(f.targetLow)} – {fmtMoney(f.targetHigh)}
          </p>
          {a && (
            <div className="mt-4">
              <p className="text-[0.7rem] uppercase tracking-[0.12em] font-bold text-ink-soft">Recomendación · {a.consensus}</p>
              <div className="flex h-3 rounded-full overflow-hidden mt-2" role="img" aria-label={`${a.strongBuy + a.buy} compra, ${a.hold} mantener, ${a.sell + a.strongSell} venta`}>
                {[
                  [a.strongBuy + a.buy, "var(--sig-strong)"],
                  [a.hold, "var(--sig-watch)"],
                  [a.sell + a.strongSell, "var(--sig-avoid)"],
                ].map(([n, c], i) => (
                  <span key={i} style={{ width: `${(Number(n) / Math.max(1, a.total)) * 100}%`, background: String(c) }} />
                ))}
              </div>
              <p className="text-xs text-ink-soft mt-1.5 num">
                {a.strongBuy + a.buy} compra · {a.hold} mantener · {a.sell + a.strongSell} venta
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
