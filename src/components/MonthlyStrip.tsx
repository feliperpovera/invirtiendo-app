"use client";

import type { PricePoint } from "@/lib/analysis/types";
import { fmtMoney, fmtPct, isNum } from "@/lib/format";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

interface Mes {
  key: string;
  label: string;
  pts: PricePoint[];
  open: number;
  close: number;
  min: number;
  max: number;
  changePct: number;
}

/** Agrupa los cierres diarios por mes calendario. */
function agrupar(daily: PricePoint[], meses: number): Mes[] {
  const map = new Map<string, PricePoint[]>();
  for (const p of daily) {
    const d = new Date(p.t);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    const arr = map.get(k);
    if (arr) arr.push(p);
    else map.set(k, [p]);
  }
  return [...map.entries()]
    .slice(-meses)
    .map(([key, pts]) => {
      const d = new Date(pts[0].t);
      const cierres = pts.map((x) => x.c);
      const open = cierres[0];
      const close = cierres[cierres.length - 1];
      return {
        key,
        label: `${MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        pts,
        open,
        close,
        min: Math.min(...pts.map((x) => x.l ?? x.c)),
        max: Math.max(...pts.map((x) => x.h ?? x.c)),
        changePct: open > 0 ? ((close - open) / open) * 100 : 0,
      };
    })
    .filter((m) => m.pts.length >= 3);
}

/**
 * Tira de meses bajo el precio: cada mes con su miniatura, su rango y su
 * variación. Sirve para ver de un vistazo el recorrido reciente de la acción.
 */
export function MonthlyStrip({ daily, meses = 5, height = 40 }: { daily: PricePoint[]; meses?: number; height?: number }) {
  const data = agrupar(daily, meses);
  if (data.length < 2) return null;

  return (
    <div className="flex gap-2 w-full">
      {data.map((m, i) => {
        const up = m.changePct >= 0;
        const color = up ? "var(--sig-strong)" : "var(--sig-avoid)";
        const rango = m.max - m.min || 1;
        const W = 100;
        const d = m.pts
          .map((p, j) => {
            const x = (j / (m.pts.length - 1 || 1)) * W;
            const y = height - ((p.c - m.min) / rango) * height;
            return `${j ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
          })
          .join(" ");
        const actual = i === data.length - 1;
        const velas = m.pts.every((p) => p.o != null);
        const Y = (v: number) => height - ((v - m.min) / rango) * height;
        const paso = W / m.pts.length;
        return (
          <div
            key={m.key}
            className={`flex-1 min-w-0 rounded-xl px-2 py-1.5 ${actual ? "bg-cream-2" : "bg-paper border border-line-soft"}`}
            title={`${m.label}: ${fmtMoney(m.open)} → ${fmtMoney(m.close)} · mín ${fmtMoney(m.min)} · máx ${fmtMoney(m.max)}`}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="text-[0.62rem] uppercase tracking-wider font-bold text-ink-soft">{m.label}</span>
              <span className="num text-[0.68rem] font-bold" style={{ color }}>
                {fmtPct(m.changePct, 1, true)}
              </span>
            </div>
            <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="block w-full mt-0.5" style={{ height }} aria-hidden>
              {velas ? (
                m.pts.map((p, j) => {
                  const c = p.c >= p.o! ? "var(--sig-strong)" : "var(--sig-avoid)";
                  const x = paso * (j + 0.5);
                  const top = Y(Math.max(p.o!, p.c));
                  return (
                    <g key={p.t}>
                      <line x1={x} x2={x} y1={Y(p.h!)} y2={Y(p.l!)} stroke={c} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                      <rect x={x - paso * 0.32} width={paso * 0.64} y={top} height={Math.max(0.6, Y(Math.min(p.o!, p.c)) - top)} fill={c} />
                    </g>
                  );
                })
              ) : (
                <>
                  <path d={`${d} L${W},${height} L0,${height} Z`} fill={color} opacity="0.12" />
                  <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                </>
              )}
            </svg>
            <div className="flex justify-between text-[0.6rem] text-ink-soft num">
              <span>{fmtMoney(m.min, 0)}</span>
              <span>{fmtMoney(m.max, 0)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export const _isNum = isNum;
