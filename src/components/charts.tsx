import type { PricePoint } from "@/lib/analysis/types";
import { isNum, fmtMoney } from "@/lib/format";

/* ── Sparkline de precio ─────────────────────────────────────────── */
export function Sparkline({ points, width = 220, height = 56, stroke = "var(--terracotta)", fill = true, baseline, responsive = false }: { points: PricePoint[]; width?: number; height?: number; stroke?: string; fill?: boolean; baseline?: number | null; responsive?: boolean }) {
  if (points.length < 2) return <div className={responsive ? "skeleton w-full" : "skeleton"} style={{ width: responsive ? undefined : width, height }} />;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.c);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  if (isNum(baseline)) {
    minY = Math.min(minY, baseline);
    maxY = Math.max(maxY, baseline);
  }
  const pad = (maxY - minY) * 0.08 || 1;
  minY -= pad;
  maxY += pad;
  const X = (t: number) => ((t - minX) / (maxX - minX || 1)) * width;
  const Y = (c: number) => height - ((c - minY) / (maxY - minY || 1)) * height;
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.c).toFixed(1)}`).join(" ");
  const area = `${d} L${width},${height} L0,${height} Z`;
  const up = ys[ys.length - 1] >= ys[0];
  const col = stroke === "auto" ? (up ? "var(--sig-strong)" : "var(--sig-avoid)") : stroke;
  return (
    <svg width={responsive ? "100%" : width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={responsive ? "none" : undefined} className={responsive ? "block w-full" : undefined} role="img" aria-label="Evolución del precio">
      {fill && <path d={area} fill={col} opacity="0.12" />}
      {isNum(baseline) && <line x1="0" x2={width} y1={Y(baseline)} y2={Y(baseline)} stroke="var(--olive)" strokeDasharray="3 3" strokeWidth="1" />}
      <path d={d} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ── Barras anuales (ingresos, FCF…) ─────────────────────────────── */
export function Bars({ data, height = 120, format = (v: number) => v.toFixed(0), color = "var(--ink)", accentLast = true, label }: { data: Array<{ label: string; v: number | null }>; height?: number; format?: (v: number) => string; color?: string; accentLast?: boolean; label?: string }) {
  const vals = data.map((d) => d.v).filter(isNum) as number[];
  if (!vals.length) return <p className="text-sm text-ink-soft">Sin datos</p>;
  const max = Math.max(...vals, 0);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const zeroY = (max / range) * height;
  return (
    <div>
      {label && <p className="text-xs text-ink-soft mb-1">{label}</p>}
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => {
          if (!isNum(d.v)) return <div key={d.label} className="flex-1" />;
          const h = (Math.abs(d.v) / range) * height;
          const top = d.v >= 0 ? zeroY - h : zeroY;
          const isLast = i === data.length - 1;
          return (
            <div key={d.label} className="flex-1 relative group" style={{ height }} title={`${d.label}: ${format(d.v)}`}>
              <div className="absolute left-0 right-0 rounded-[4px]" style={{ top, height: Math.max(2, h), background: d.v < 0 ? "var(--sig-avoid)" : accentLast && isLast ? "var(--terracotta)" : color, opacity: accentLast && !isLast ? 0.75 : 1 }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1">
        {data.map((d) => (
          <div key={d.label} className="flex-1 text-center text-[0.62rem] text-ink-soft tabular truncate">
            {d.label.slice(-2)}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Anillo de score ─────────────────────────────────────────────── */
export function ScoreRing({ value, size = 128, label, grade }: { value: number; size?: number; label?: string; grade?: string }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const color = pct >= 68 ? "var(--sig-strong)" : pct >= 55 ? "var(--sig-good)" : pct >= 40 ? "var(--sig-watch)" : "var(--sig-avoid)";
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Score ${value} de 100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-soft)" strokeWidth="10" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray 600ms cubic-bezier(.2,.7,.2,1)" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display num leading-none" style={{ fontSize: size * 0.3 }}>
          {Math.round(value)}
        </span>
        {grade && <span className="text-[0.7rem] font-bold tracking-wider text-ink-soft mt-1">NOTA {grade}</span>}
        {label && <span className="text-[0.65rem] text-ink-soft">{label}</span>}
      </div>
    </div>
  );
}

/* ── Buy Zone (firma visual): precio vs Fair Value y sus descuentos ── */
export function BuyZoneGauge({ price, fair, gradual, strong }: { price: number; fair: number | null; gradual: number | null; strong: number | null }) {
  if (!isNum(fair) || !isNum(gradual) || !isNum(strong)) {
    return <p className="text-sm text-ink-soft">Sin fair value fiable: no se puede dibujar la buy zone.</p>;
  }
  // Escala: de 0.6·Fair Value a 1.4·Fair Value
  const lo = fair * 0.6;
  const hi = fair * 1.4;
  const X = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const px = X(Math.max(lo, Math.min(hi, price)));
  const segs = [
    { from: 0, to: X(strong), color: "var(--sig-strong)", label: "Oportunidad" },
    { from: X(strong), to: X(gradual), color: "var(--sig-good)", label: "Gradual" },
    { from: X(gradual), to: X(fair * 1.1), color: "var(--sig-watch)", label: "Observar" },
    { from: X(fair * 1.1), to: X(fair * 1.3), color: "var(--sig-wait)", label: "Esperar" },
    { from: X(fair * 1.3), to: 100, color: "var(--sig-avoid)", label: "Evitar" },
  ];
  return (
    <div className="w-full" role="img" aria-label={`Precio ${fmtMoney(price)} frente a fair value ${fmtMoney(fair)}`}>
      <div className="relative h-14">
        {/* marcador de precio */}
        <div className="absolute -top-0.5 flex flex-col items-center" style={{ left: `${px}%`, transform: "translateX(-50%)" }}>
          <span className="pill bg-ink text-cream text-[0.7rem] px-2 py-1 whitespace-nowrap">Hoy {fmtMoney(price)}</span>
          <span className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[7px] border-l-transparent border-r-transparent" style={{ borderTopColor: "var(--ink)" }} />
        </div>
      </div>
      <div className="relative h-4 rounded-full overflow-hidden flex">
        {segs.map((s) => (
          <div key={s.label} style={{ width: `${s.to - s.from}%`, background: s.color }} title={s.label} />
        ))}
      </div>
      <div className="relative h-10 text-[0.68rem] text-ink-soft">
        {[
          { v: strong, t: "−25%", top: fmtMoney(strong, 0) },
          { v: gradual, t: "−15%", top: fmtMoney(gradual, 0) },
          { v: fair, t: "FV", top: "" },
        ].map((m) => (
          <div key={m.t} className="absolute flex flex-col items-center whitespace-nowrap" style={{ left: `${X(m.v)}%`, transform: "translateX(-50%)" }}>
            <span className="w-px h-2 bg-ink-soft" />
            {m.top && <span className="font-bold text-ink tabular">{m.top}</span>}
            <span>{m.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Barra horizontal de pilar ───────────────────────────────────── */
export function PillarBar({ title, score, weight }: { title: string; score: number | null; weight: number }) {
  const v = isNum(score) ? score : 0;
  const color = !isNum(score) ? "var(--line)" : v >= 68 ? "var(--sig-strong)" : v >= 55 ? "var(--sig-good)" : v >= 40 ? "var(--sig-watch)" : "var(--sig-avoid)";
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 shrink-0 font-semibold">{title}</span>
      <div className="flex-1 h-2.5 rounded-full bg-line-soft overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${v}%`, background: color, transition: "width 600ms cubic-bezier(.2,.7,.2,1)" }} />
      </div>
      <span className="w-10 text-right num font-bold">{isNum(score) ? Math.round(score) : "—"}</span>
      <span className="w-10 text-right text-xs text-ink-soft">{weight}%</span>
    </div>
  );
}

/* ── Rango con posición del precio ───────────────────────────────── */
/**
 * Barra de rango al estilo de la mesa de un bróker: mínimo a la izquierda, máximo a la
 * derecha, el precio de hoy como marcador y el promedio (punto medio) como tick.
 * Sirve para el rango del día y para el de 52 semanas.
 */
export function RangeBar({
  label,
  low,
  high,
  price,
  compact = false,
}: {
  label: string;
  low: number | null;
  high: number | null;
  price: number | null;
  compact?: boolean;
}) {
  if (!isNum(low) || !isNum(high) || !isNum(price) || high <= low) {
    return (
      <div className={compact ? "" : "min-w-[11rem]"}>
        {!compact && <p className="text-[0.68rem] uppercase tracking-wider font-bold text-ink-soft mb-1">{label}</p>}
        <p className="text-xs text-ink-soft">—</p>
      </div>
    );
  }
  const medio = (low + high) / 2;
  const pos = Math.max(0, Math.min(100, ((price - low) / (high - low)) * 100));
  const dig = high < 10 ? 3 : 2;
  // Dónde está el precio dentro del rango: abajo (verde, cerca del mínimo) o arriba.
  const color = pos <= 25 ? "var(--sig-strong)" : pos >= 75 ? "var(--sig-avoid)" : "var(--ink)";
  return (
    <div className={compact ? "w-36" : "min-w-[11rem]"} role="img" aria-label={`${label}: de ${fmtMoney(low)} a ${fmtMoney(high)}, precio ${fmtMoney(price)}, promedio ${fmtMoney(medio)}`}>
      {!compact && <p className="text-[0.68rem] uppercase tracking-wider font-bold text-ink-soft mb-1">{label}</p>}
      <div className="flex items-center justify-between text-[0.7rem] num text-ink-soft leading-none">
        <span>{fmtMoney(low, dig)}</span>
        <span>{fmtMoney(high, dig)}</span>
      </div>
      <div className="relative h-1 my-1.5 rounded-full bg-cream-2">
        {/* promedio del rango */}
        <span className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-line" style={{ left: "50%" }} title={`Promedio ${fmtMoney(medio, dig)}`} />
        {/* precio de hoy: cuadrado como en la mesa de un bróker, se lee de un vistazo */}
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-[2px] ring-1 ring-cream"
          style={{ left: `${pos}%`, background: color }}
          title={fmtMoney(price, dig)}
        />
      </div>
      <p className="text-[0.7rem] text-ink-soft leading-none whitespace-nowrap">
        Promedio <b className="num text-ink">{fmtMoney(medio, dig)}</b>
        <span className="ml-1.5">· {pos.toFixed(0)}%{compact ? "" : " del rango"}</span>
      </p>
    </div>
  );
}
