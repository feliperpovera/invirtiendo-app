import type { ConsensoFila } from "@/lib/analysis/consenso";
import { Card, Eyebrow } from "@/components/ui";
import { fmtBig, fmtNum, fmtPct, fmtX, isNum } from "@/lib/format";

type Clave = "revenue" | "eps";

/** Pasado en línea sólida, promedio de analistas punteado y banda mínimo–máximo. */
function Grafica({ filas, k, titulo, fmt }: { filas: ConsensoFila[]; k: Clave; titulo: string; fmt: (v: number) => string }) {
  const lo = k === "revenue" ? "revLow" : "epsLow";
  const hi = k === "revenue" ? "revHigh" : "epsHigh";
  const pts = filas.filter((f) => isNum(f[k]));
  if (pts.length < 2) return null;
  const W = 520, H = 230, L = 8, R = 62, T = 14, B = 26;
  const vals = pts.flatMap((f) => [f[k], f[lo], f[hi]]).filter(isNum) as number[];
  const min = Math.min(0, ...vals), max = Math.max(...vals) * 1.08;
  const x = (i: number) => L + (i * (W - L - R)) / (filas.length - 1);
  const y = (v: number) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const idx = (f: ConsensoFila) => filas.indexOf(f);
  const linea = (fs: ConsensoFila[], g: (f: ConsensoFila) => number) => fs.map((f, i) => `${i ? "L" : "M"}${x(idx(f)).toFixed(1)},${y(g(f)).toFixed(1)}`).join(" ");
  const pasado = pts.filter((f) => !f.estimado);
  const futuro = pts.filter((f) => f.estimado);
  const puente = pasado.length && futuro.length ? [pasado.at(-1)!, ...futuro] : futuro;
  const banda = puente.filter((f) => isNum(f[lo]) && isNum(f[hi]) || !f.estimado);
  const bandaD = banda.length > 1
    ? `${linea(banda, (f) => (f.estimado ? (f[hi] as number) : (f[k] as number)))} ${[...banda].reverse().map((f) => `L${x(idx(f)).toFixed(1)},${y(f.estimado ? (f[lo] as number) : (f[k] as number)).toFixed(1)}`).join(" ")} Z`
    : "";
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + t * (max - min));
  return (
    <div className="min-w-0">
      <p className="font-display text-lg text-center">{titulo}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`${titulo}: histórico y pronóstico de analistas`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line, #d9d2bf)" strokeWidth="0.6" />
            <text x={W - R + 6} y={y(v) + 3} fontSize="10" fill="var(--ink-soft, #6b6357)">{fmt(v)}</text>
          </g>
        ))}
        {bandaD && <path d={bandaD} fill="var(--terracotta)" opacity="0.13" />}
        {pasado.length > 1 && <path d={linea(pasado, (f) => f[k] as number)} fill="none" stroke="var(--olive-deep)" strokeWidth="2.4" />}
        {puente.length > 1 && <path d={linea(puente, (f) => f[k] as number)} fill="none" stroke="var(--terracotta)" strokeWidth="2.2" strokeDasharray="6 4" />}
        {pts.map((f) => (
          <circle key={f.fy} cx={x(idx(f))} cy={y(f[k] as number)} r="3.4" fill={(k === "revenue" ? f.proyRev : f.proyEps) ? "var(--cream, #f5eedc)" : f.estimado ? "var(--terracotta)" : "var(--olive-deep)"} stroke="var(--terracotta)" strokeWidth={(k === "revenue" ? f.proyRev : f.proyEps) ? 1.6 : 0}>
            <title>{`FY ${f.fy}: ${fmt(f[k] as number)}${f.estimado && isNum(f[lo]) && isNum(f[hi]) ? ` (rango ${fmt(f[lo] as number)} – ${fmt(f[hi] as number)})` : ""}`}</title>
          </circle>
        ))}
        {filas.map((f, i) => (
          <text key={f.fy} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--ink-soft, #6b6357)">{`FY${String(f.fy).slice(2)}`}</text>
        ))}
      </svg>
      <p className="text-[0.68rem] text-ink-soft text-center">
        <span style={{ color: "var(--olive-deep)" }}>━</span> Reportado · <span style={{ color: "var(--terracotta)" }}>┅</span> Promedio analistas · <span className="inline-block w-3 h-2 align-middle" style={{ background: "var(--terracotta)", opacity: 0.25 }} /> Mínimo–máximo
      </p>
    </div>
  );
}

export function Consenso({ filas, moneda = "USD" }: { filas: ConsensoFila[]; moneda?: string }) {
  if (filas.length < 2 || !filas.some((f) => f.estimado)) return null;
  const proy = (c: ConsensoFila, k?: "rev" | "eps") => (k === "rev" ? c.proyRev : k === "eps" ? c.proyEps : false);
  const fila = (label: string, f: (c: ConsensoFila) => string, k?: "rev" | "eps") => (
    <tr key={label}>
      <th scope="row" className="text-left font-medium whitespace-nowrap">{label}</th>
      {filas.map((c) => (
        <td key={c.fy} className={`num ${proy(c, k) ? "italic text-ink-soft" : ""}`} style={{ background: c.estimado ? "var(--terracotta-tint)" : "var(--olive-tint)" }} title={proy(c, k) ? "Proyección Invirtiendo (sin consenso publicado)" : undefined}>
          {f(c)}
          {proy(c, k) && f(c) !== "—" && <sup className="ml-0.5 not-italic">p</sup>}
        </td>
      ))}
    </tr>
  );
  const n = (v: number | null) => (isNum(v) ? String(v) : "—");
  return (
    <section id="consenso">
      <Eyebrow className="mb-2">Pasado y consenso de analistas</Eyebrow>
      <Card className="p-0 overflow-hidden">
        <div className="scroll-x">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th className="text-left">Año fiscal</th>
                {filas.map((c) => (
                  <th key={c.fy} className="num">FY {c.fy}{c.estimado && <span className="block text-[0.6rem] font-normal normal-case tracking-normal">estimado</span>}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fila("Cierre", (c) => c.end ?? "—")}
              {fila(`Ingresos (${moneda})`, (c) => fmtBig(c.revenue, 2), "rev")}
              {fila("Crec. ingresos", (c) => fmtPct(c.revGrowth, 1), "rev")}
              {fila("EPS", (c) => (isNum(c.eps) ? fmtNum(c.eps, 2) : "—"), "eps")}
              {fila("Crec. EPS", (c) => fmtPct(c.epsGrowth, 1), "eps")}
              {fila("Analistas: ingresos", (c) => n(c.revN))}
              {fila("Analistas: EPS", (c) => n(c.epsN))}
              {fila("P/S", (c) => fmtX(c.ps, 2), "rev")}
              {fila("P/E", (c) => fmtX(c.pe, 2), "eps")}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="mt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Grafica filas={filas} k="revenue" titulo="Ingresos" fmt={(v) => fmtBig(v, 0)} />
          <Grafica filas={filas} k="eps" titulo="EPS" fmt={(v) => fmtNum(v, 2)} />
        </div>
        <p className="text-xs text-ink-soft mt-3">
          Verde = reportado (10-K). Naranja = consenso de analistas: ingresos y EPS de este año y el próximo (Yahoo Finance) y EPS hasta 4 años (Nasdaq). Horizonte de 5 años: donde no hay consenso publicado, el valor es una <b>proyección Invirtiendo</b> (cursiva con <sup>p</sup>, punto hueco en la gráfica): el crecimiento del último año con consenso converge al crecimiento a 5 años que estiman los analistas, y el rango se abre ±10% por año. P/S y P/E futuros con el precio de hoy.
        </p>
      </Card>
    </section>
  );
}
