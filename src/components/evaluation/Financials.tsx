import type { Evaluation } from "@/lib/analysis/types";
import { Card, Eyebrow } from "@/components/ui";
import { Bars, Sparkline } from "@/components/charts";
import { fmtBig, fmtPct, fmtNum, isNum, pct } from "@/lib/format";

function MiniLine({ title, data, suffix = "%" }: { title: string; data: Array<{ fy: number; v: number | null }>; suffix?: string }) {
  const pts = data.filter((d) => isNum(d.v)).map((d) => ({ t: d.fy, c: d.v as number }));
  const last = pts.at(-1);
  const first = pts[0];
  return (
    <div className="min-w-0">
      <p className="text-[0.65rem] uppercase tracking-wider font-bold text-ink-soft">{title}</p>
      <p className="num font-bold text-lg leading-tight">
        {last ? `${last.c.toFixed(1)}${suffix}` : "—"}
        {first && last && pts.length > 2 && <span className="text-xs text-ink-soft font-normal"> · desde {first.c.toFixed(1)}{suffix}</span>}
      </p>
      <Sparkline points={pts} width={180} height={40} stroke="var(--olive)" fill={false} />
    </div>
  );
}

export function Financials({ ev }: { ev: Evaluation }) {
  const rows = ev.fundamentals.annual.slice(-10);
  const per = new Map(ev.fundamentals.annual.map((r) => [r.fy, r]));
  if (!rows.length) {
    return (
      <Card>
        <Eyebrow>Estados financieros</Eyebrow>
        <p className="text-sm text-ink-soft mt-2">No hay estados financieros disponibles para este símbolo (empresas extranjeras con IFRS o listados recientes).</p>
      </Card>
    );
  }
  const lbl = (fy: number) => String(fy);
  // Los estados de un ADR vienen en su moneda local: etiquetarlos como USD es mentir.
  const mon = ev.profile.statementCurrency && ev.profile.statementCurrency !== "USD" ? ev.profile.statementCurrency : "USD";
  const cols = rows.slice(-8);
  const gm = rows.map((r) => ({ fy: r.fy, v: pct(r.grossProfit, r.revenue) }));
  const nm = rows.map((r) => ({ fy: r.fy, v: pct(r.netIncome, r.revenue) }));
  const om = rows.map((r) => ({ fy: r.fy, v: pct(r.operatingIncome, r.revenue) }));
  const roicHist = ev.metrics.history.roic.slice(-10).map((p) => ({ fy: Number(p.period.slice(0, 4)), v: p.v }));
  const line = (label: string, f: (r: (typeof rows)[number]) => string, cls = "") => (
    <tr key={label}>
      <td className={`font-medium whitespace-nowrap ${cls}`}>{label}</td>
      {cols.map((r) => (
        <td key={r.fy} className={`num ${cls}`}>
          {f(r)}
        </td>
      ))}
    </tr>
  );
  const growth = (r: (typeof rows)[number]) => {
    const p = per.get(r.fy - 1);
    return p && isNum(p.revenue) && p.revenue > 0 && isNum(r.revenue) ? fmtPct(((r.revenue - p.revenue) / p.revenue) * 100, 0, true) : "—";
  };
  return (
    <section>
      <Eyebrow className="mb-2">Financials · {ev.fundamentals.sources.includes("sec") ? "10-K auditados (SEC)" : "Yahoo Finance"}</Eyebrow>
      <Card>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Bars label={`Ingresos (${mon})`} data={rows.map((r) => ({ label: lbl(r.fy), v: r.revenue }))} format={(v) => fmtBig(v)} />
          <Bars label="Utilidad neta" data={rows.map((r) => ({ label: lbl(r.fy), v: r.netIncome }))} format={(v) => fmtBig(v)} color="var(--olive)" />
          <Bars label="Flujo de caja libre" data={rows.map((r) => ({ label: lbl(r.fy), v: r.fcf }))} format={(v) => fmtBig(v)} color="var(--olive-2)" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6 pt-5 border-t border-line-soft">
          <MiniLine title="Margen bruto" data={gm} />
          <MiniLine title="Margen operativo" data={om} />
          <MiniLine title="Margen neto" data={nm} />
          <MiniLine title="ROIC (aprox.)" data={roicHist} />
        </div>
        <div className="scroll-x mt-6 pt-5 border-t border-line-soft">
          <table className="table text-[0.82rem] min-w-[720px]">
            <thead>
              <tr>
                <th>Año fiscal</th>
                {cols.map((r) => (
                  <th key={r.fy} className="num">
                    {r.fy}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {line("Ingresos", (r) => fmtBig(r.revenue, 1))}
              {line("Crecimiento", growth, "text-ink-soft")}
              {line("Margen bruto", (r) => fmtPct(pct(r.grossProfit, r.revenue), 0))}
              {line("Margen operativo", (r) => fmtPct(pct(r.operatingIncome, r.revenue), 0))}
              {line("Utilidad neta", (r) => fmtBig(r.netIncome, 1))}
              {line(`EPS diluido (${mon})`, (r) => (isNum(r.epsDiluted) ? fmtNum(r.epsDiluted, 2) : "—"))}
              {line("FCF", (r) => fmtBig(r.fcf, 1))}
              {line("Deuda total", (r) => fmtBig(r.totalDebt, 1))}
              {line("Caja e inversiones", (r) => fmtBig(r.cash, 1))}
              {line("Acciones diluidas", (r) => (isNum(r.sharesDiluted) ? fmtBig(r.sharesDiluted, 2, "") : "—"))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
