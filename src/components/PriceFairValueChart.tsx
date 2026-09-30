"use client";

import { useMemo, useState } from "react";
import type { PriceHistory, N } from "@/lib/analysis/types";
import type { FvHistory } from "@/lib/analysis/fvhistory";
import { fmtMoney, fmtPct, isNum, clamp } from "@/lib/format";
import { ema, bollinger } from "@/lib/indicadores";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
type RangeKey = "1M" | "2M" | "3M" | "6M" | "1A" | "2A" | "5A" | "10A";
const RANGES: Array<{ k: RangeKey; years: number }> = [
  { k: "1M", years: 1 / 12 },
  { k: "2M", years: 2 / 12 },
  { k: "3M", years: 0.25 },
  { k: "6M", years: 0.5 },
  { k: "1A", years: 1 },
  { k: "2A", years: 2 },
  { k: "5A", years: 5 },
  { k: "10A", years: 10 },
];

const fmtDay = (t: number) => {
  const d = new Date(t);
  return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`;
};

/**
 * Precio vs Fair Value en el tiempo: banda de confianza, marcas de resultados
 * y dividendos, y proyección a 12 meses con objetivo propio y de analistas.
 */
export function PriceFairValueChart({
  history,
  fv,
  current,
  asOf,
  height = 320,
}: {
  history: PriceHistory;
  fv: FvHistory | null;
  current: number;
  asOf: number;
  height?: number;
}) {
  const [range, setRange] = useState<RangeKey>("2A");
  const [hover, setHover] = useState<number | null>(null);
  const [showBB, setShowBB] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const W = 1000;
  const H = height;
  const PAD = { t: 20, r: 96, b: 30, l: 8 };

  const model = useMemo(() => {
    const years = RANGES.find((r) => r.k === range)!.years;
    const from = asOf - years * 365 * 86400000;
    const src = years <= 2 ? history.daily : years <= 5 ? history.weekly : history.monthly;
    const all = src.length ? src : history.daily;
    // Indicadores sobre toda la serie (así arrancan llenos en el borde izquierdo) y luego se recorta al rango
    const closes = all.map((p) => p.c);
    const e200 = ema(closes, 200);
    const bb = bollinger(closes);
    const first = all.findIndex((p) => p.t >= from);
    const price = first < 0 ? [] : all.slice(first);
    if (price.length < 5) return null;
    const ind = { e200: e200.slice(first), bb: bb.slice(first) };

    const t0 = price[0].t;
    // La proyección ocupa como mucho la mitad del rango visible: en 1M no se estira 12 meses
    const span = asOf - t0;
    const t1 = fv ? Math.min(fv.targetDate, asOf + span * 0.5) : price[price.length - 1].t;
    const fvPts = (fv?.points ?? []).filter((p) => p.t >= t0 - 120 * 86400000);
    const ys: number[] = [...price.map((p) => p.c), current];
    if (showBB) for (const b of ind.bb) if (b) ys.push(b.up, b.dn);
    for (const p of fvPts) ys.push(p.lo, p.hi);
    if (fv) {
      if (isNum(fv.fairValueNow)) ys.push(fv.fairValueNow);
      if (isNum(fv.targetOwn)) ys.push(fv.targetOwn);
      if (isNum(fv.targetAnalyst)) ys.push(fv.targetAnalyst);
    }
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    const pad = (hi - lo) * 0.08 || 1;
    const yMin = Math.max(0, lo - pad);
    const yMax = hi + pad;
    const X = (t: number) => PAD.l + ((t - t0) / (t1 - t0 || 1)) * (W - PAD.l - PAD.r);
    const Y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.t - PAD.b);
    return { price, ind, fvPts, t0, t1, yMin, yMax, X, Y, years };
  }, [history, fv, current, asOf, range, showBB, H, PAD.l, PAD.r, PAD.t, PAD.b, W]);

  const selector = (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Rango del gráfico">
      {RANGES.map((r) => (
        <button
          key={r.k}
          type="button"
          onClick={() => setRange(r.k)}
          aria-pressed={range === r.k}
          className={`px-2 py-1 rounded-full text-[0.7rem] font-bold transition-colors ${range === r.k ? "bg-ink text-cream" : "border border-line text-ink-soft hover:border-ink"}`}
        >
          {r.k}
        </button>
      ))}
    </div>
  );

  if (!model) {
    return (
      <div>
        <div className="flex justify-end mb-2">{selector}</div>
        <div className="skeleton w-full" style={{ height }} />
      </div>
    );
  }
  const { price, ind, fvPts, t0, t1, yMin, yMax, X, Y, years } = model;

  const line = (pts: Array<{ x: number; y: number }>) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const pricePts = price.map((p) => ({ x: X(p.t), y: Y(p.c), t: p.t, c: p.c }));
  const seriePath = (vals: Array<number | null | undefined>) => {
    let d = "";
    vals.forEach((v, i) => {
      if (v == null) return;
      d += `${d ? "L" : "M"}${pricePts[i].x.toFixed(1)},${Y(v).toFixed(1)}`;
    });
    return d;
  };
  const bbIdx = ind.bb.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  const bbBand = bbIdx.length > 1
    ? `${bbIdx.map((i, k) => `${k ? "L" : "M"}${pricePts[i].x.toFixed(1)},${Y(ind.bb[i]!.up).toFixed(1)}`).join("")}${[...bbIdx].reverse().map((i) => `L${pricePts[i].x.toFixed(1)},${Y(ind.bb[i]!.dn).toFixed(1)}`).join("")}Z`
    : "";

  // Fair Value escalonado + banda de confianza
  let fvPath = "";
  let bandPath = "";
  if (fvPts.length > 1) {
    const step: Array<{ x: number; y: number }> = [];
    const up: Array<{ x: number; y: number }> = [];
    const dn: Array<{ x: number; y: number }> = [];
    fvPts.forEach((p, i) => {
      const x = Math.max(PAD.l, X(p.t));
      if (i > 0) {
        const prev = fvPts[i - 1];
        step.push({ x, y: Y(prev.fv) });
        up.push({ x, y: Y(prev.hi) });
        dn.push({ x, y: Y(prev.lo) });
      }
      step.push({ x, y: Y(p.fv) });
      up.push({ x, y: Y(p.hi) });
      dn.push({ x, y: Y(p.lo) });
    });
    fvPath = line(step);
    bandPath = `${line(up)} ${line([...dn].reverse()).replace("M", "L")} Z`;
  }

  // Eje de tiempo adaptativo: días o semanas en rangos cortos; meses, trimestres o años en los largos
  const ticks: Array<{ x: number; label: string }> = [];
  if (years <= 0.5) {
    const stepDays = years <= 1 / 12 ? 7 : years <= 0.25 ? 14 : 30;
    const cur = new Date(t0);
    cur.setHours(0, 0, 0, 0);
    cur.setDate(cur.getDate() + stepDays);
    while (cur.getTime() < t1) {
      ticks.push({ x: X(cur.getTime()), label: `${cur.getDate()} ${MES[cur.getMonth()]}` });
      cur.setDate(cur.getDate() + stepDays);
    }
  } else {
    const stepMonths = years <= 1 ? 2 : years <= 2 ? 3 : years <= 5 ? 6 : 12;
    const d0 = new Date(t0);
    const cur = new Date(d0.getFullYear(), Math.ceil((d0.getMonth() + 1) / stepMonths) * stepMonths, 1);
    while (cur.getTime() < t1) {
      ticks.push({ x: X(cur.getTime()), label: stepMonths === 12 ? String(cur.getFullYear()) : `${MES[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}` });
      cur.setMonth(cur.getMonth() + stepMonths);
    }
  }

  const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: PAD.t + f * (H - PAD.t - PAD.b), v: yMax - f * (yMax - yMin) }));
  const marksY = new Set<number>();

  // Eventos dentro del rango visible, espaciados para que no saturen el eje
  const inRange = (t: number) => t >= t0 && t <= asOf;
  const thin = <T,>(arr: T[], max: number): T[] => {
    if (arr.length <= max) return arr;
    const step = Math.ceil(arr.length / max);
    return arr.filter((_, i) => (arr.length - 1 - i) % step === 0);
  };
  const maxMarks = years <= 1 ? 6 : years <= 2 ? 8 : 6;
  const earn = thin((fv?.earnings ?? []).filter(inRange), maxMarks);
  const divs = thin((history.dividends ?? []).filter((d) => inRange(d.t)), maxMarks);

  const now = X(asOf);
  /** Punto final de una proyección, recortado al borde derecho del gráfico */
  const proj = (to: number) => {
    const end = Math.min(fv?.targetDate ?? t1, t1);
    const f = (end - asOf) / ((fv?.targetDate ?? t1) - asOf || 1);
    return { x: X(end), f: clamp(f, 0, 1) };
  };
  const hoverPt = hover !== null ? pricePts.reduce((a, b) => (Math.abs(b.x - hover) < Math.abs(a.x - hover) ? b : a)) : null;
  const fvAt = (t: number) => {
    if (!fv || !fv.points.length) return null;
    let v: number | null = null;
    for (const p of fv.points) if (p.t <= t) v = p.fv;
    return v ?? fv.points[0].fv;
  };
  const hoverFv = hoverPt ? fvAt(hoverPt.t) : null;
  const shown = hoverPt ?? { c: current, t: asOf, x: now, y: Y(current) };
  const shownFv = hoverPt ? hoverFv : (fv?.fairValueNow ?? fvAt(asOf));
  const gap = isNum(shownFv) && shown.c > 0 ? ((shownFv - shown.c) / shown.c) * 100 : null;

  // Etiquetas del margen derecho, separadas para que no se solapen
  const marks: Array<{ label: string; text: string; color: string; y: number }> = [];
  const push = (label: string, v: N, color: string) => {
    if (isNum(v)) marks.push({ label, text: fmtMoney(v, 0), color, y: Y(v) });
  };
  push("precio", current, "var(--ink)");
  if (fv) {
    push("fvhoy", fv.fairValueNow, "var(--olive-deep)");
    const visible = (fv.targetDate - asOf) <= (t1 - asOf) * 1.02;
    if (visible) {
      push("objetivo", fv.targetOwn, "var(--olive-2)");
      push("analistas", fv.targetAnalyst, "var(--terracotta)");
    }
  }
  marks.sort((a, b) => a.y - b.y);
  for (let i = 1; i < marks.length; i++) if (marks[i].y - marks[i - 1].y < 15) marks[i].y = marks[i - 1].y + 15;
  for (const mk of marks) marksY.add(mk.y);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <p className="text-sm">
          <span className="text-ink-soft">{fmtDay(shown.t)}</span> · <b className="num">{fmtMoney(shown.c)}</b>
          {isNum(shownFv) && (
            <>
              {" "}
              <span className="text-ink-soft">vs Fair Value</span>{" "}
              <b className="num" style={{ color: "var(--olive-deep)" }}>
                {fmtMoney(shownFv)}
              </b>
              {isNum(gap) && (
                <b className="num ml-1" style={{ color: gap >= 15 ? "var(--sig-strong)" : gap >= -10 ? "var(--sig-watch)" : "var(--sig-avoid)" }}>
                  {fmtPct(gap, 0, true)}
                </b>
              )}
            </>
          )}
        </p>
        {selector}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-pan-y"
          style={{ height }}
          preserveAspectRatio="none"
          role="img"
          aria-label="Precio frente a Fair Value en el tiempo"
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(((e.clientX - r.left) / r.width) * W);
          }}
          onMouseLeave={() => setHover(null)}
          onTouchMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(((e.touches[0].clientX - r.left) / r.width) * W);
          }}
          onTouchEnd={() => setHover(null)}
        >
          <rect x={now} y={PAD.t} width={Math.max(0, W - PAD.r - now)} height={H - PAD.t - PAD.b} fill="var(--cream-2)" opacity="0.5" />
          {gridY.map((g) => (
            <line key={g.y} x1={PAD.l} x2={W - PAD.r} y1={g.y} y2={g.y} stroke="var(--line-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          {ticks.map((t) => (
            <line key={t.x} x1={t.x} x2={t.x} y1={PAD.t} y2={H - PAD.b} stroke="var(--line-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}

          {earn.map((t) => (
            <line key={`e${t}`} x1={X(t)} x2={X(t)} y1={PAD.t} y2={H - PAD.b} stroke="var(--olive-2)" strokeWidth="1" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" opacity="0.75" />
          ))}
          {divs.map((d) => (
            <line key={`d${d.t}`} x1={X(d.t)} x2={X(d.t)} y1={H - PAD.b - 12} y2={H - PAD.b} stroke="var(--terracotta)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.8" />
          ))}

          {bandPath && <path d={bandPath} fill="var(--olive-2)" opacity="0.38" />}
          {fvPath && <path d={fvPath} fill="none" stroke="var(--olive-deep)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
          {!fvPath && fv && isNum(fv.fairValueNow) && (
            <>
              <rect x={PAD.l} y={Y(fv.fairValueNow * (1 + fv.band))} width={now - PAD.l} height={Math.abs(Y(fv.fairValueNow * (1 - fv.band)) - Y(fv.fairValueNow * (1 + fv.band)))} fill="var(--olive-2)" opacity="0.3" />
              <line x1={PAD.l} x2={now} y1={Y(fv.fairValueNow)} y2={Y(fv.fairValueNow)} stroke="var(--olive-deep)" strokeWidth="2.5" strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />
            </>
          )}

          {fv && isNum(fv.fairValueNow) && <circle cx={now} cy={Y(fv.fairValueNow)} r="4.5" fill="var(--olive-deep)" />}
          {fv && isNum(fv.targetOwn) && (
            <>
              {(() => {
                const from = fv.fairValueNow ?? fvAt(asOf) ?? current;
                const { x, f } = proj(fv.targetDate);
                const yEnd = Y(from + (fv.targetOwn - from) * f);
                return (
                  <>
                    <line x1={now} y1={Y(from)} x2={x} y2={yEnd} stroke="var(--olive-2)" strokeWidth="2" strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
                    <circle cx={x} cy={yEnd} r="4" fill="var(--olive-2)" />
                  </>
                );
              })()}
            </>
          )}
          {fv && isNum(fv.targetAnalyst) && (
            <>
              {(() => {
                const { x, f } = proj(fv.targetDate);
                const yEnd = Y(current + (fv.targetAnalyst - current) * f);
                return (
                  <>
                    <line x1={now} y1={Y(current)} x2={x} y2={yEnd} stroke="var(--terracotta)" strokeWidth="2" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
                    <circle cx={x} cy={yEnd} r="4" fill="var(--terracotta)" />
                  </>
                );
              })()}
            </>
          )}

          {showBB && bbBand && (
            <>
              <path d={bbBand} fill="var(--terracotta)" opacity="0.09" />
              <path d={seriePath(ind.bb.map((b) => b?.up))} fill="none" stroke="var(--terracotta)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7" />
              <path d={seriePath(ind.bb.map((b) => b?.dn))} fill="none" stroke="var(--terracotta)" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7" />
            </>
          )}
          {showEma && (
            <>
              <path d={seriePath(ind.e200)} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" opacity="0.75" />
            </>
          )}
          <path d={line(pricePts)} fill="none" stroke="var(--ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          <line x1={now} x2={now} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-soft)" strokeWidth="1.5" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <circle cx={now} cy={Y(current)} r="4.5" fill="var(--ink)" />

          {hoverPt && (
            <>
              <line x1={hoverPt.x} x2={hoverPt.x} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <circle cx={hoverPt.x} cy={hoverPt.y} r="4.5" fill="var(--ink)" />
              {isNum(hoverFv) && <circle cx={hoverPt.x} cy={Y(hoverFv)} r="4.5" fill="var(--olive-deep)" />}
            </>
          )}
        </svg>

        {/* Capa de texto: fuera del SVG para que no se deforme */}
        <div className="absolute inset-0 pointer-events-none select-none">
          {gridY
            .filter((g) => ![...marksY].some((m) => Math.abs(m - g.y) < 15))
            .map((g) => (
              <span key={g.y} className="absolute text-[0.62rem] text-ink-soft tabular -translate-y-1/2" style={{ left: `${((W - PAD.r + 6) / W) * 100}%`, top: `${(g.y / H) * 100}%` }}>
                {fmtMoney(g.v, 0)}
              </span>
            ))}
          {marks.map((mk) => (
            <span
              key={mk.label}
              className="absolute text-[0.66rem] font-bold tabular -translate-y-1/2 px-1 rounded"
              style={{ left: `${((W - PAD.r + 6) / W) * 100}%`, top: `${(mk.y / H) * 100}%`, color: mk.color, background: "var(--paper)" }}
            >
              {mk.text}
            </span>
          ))}
          {earn.map((t) => (
            <span
              key={`le${t}`}
              className="absolute -translate-x-1/2 inline-flex items-center justify-center w-4 h-4 rounded-[3px] border bg-paper text-[0.55rem] font-bold"
              style={{ left: `${(X(t) / W) * 100}%`, top: "2px", borderColor: "var(--olive-deep)", color: "var(--olive-deep)" }}
            >
              R
            </span>
          ))}
          {divs.map((d) => (
            <span
              key={`ld${d.t}`}
              className="absolute -translate-x-1/2 inline-flex items-center justify-center w-4 h-4 rounded-[3px] border bg-paper text-[0.55rem] font-bold"
              style={{ left: `${(X(d.t) / W) * 100}%`, bottom: "4px", borderColor: "var(--terracotta)", color: "var(--terracotta)" }}
            >
              D
            </span>
          ))}
        </div>
      </div>

      <div className="relative h-[18px] text-[0.62rem] text-ink-soft select-none">
        <span className="[&>span:nth-child(odd)]:hidden sm:[&>span:nth-child(odd)]:inline">
          {ticks.map((t) => (
            <span key={t.x} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${(t.x / W) * 100}%` }}>
              {t.label}
            </span>
          ))}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-ink rounded" /> Precio
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 h-0.5 rounded" style={{ background: "var(--olive-deep)" }} /> Fair Value {fv && isNum(fv.fairValueNow) ? fmtMoney(fv.fairValueNow) : ""}
        </span>
        {fv && (
          <span className="inline-flex items-center gap-1.5 text-ink-soft">
            <span className="w-4 h-2 rounded-sm" style={{ background: "var(--olive-2)", opacity: 0.38 }} /> Rango ±{Math.round(fv.band * 100)}%
          </span>
        )}
        {fv && isNum(fv.targetOwn) && (
          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--olive-2)" }}>
            <span className="w-4 border-t-2 border-dashed" style={{ borderColor: "var(--olive-2)" }} /> Objetivo 12m {fmtMoney(fv.targetOwn)}
          </span>
        )}
        {fv && isNum(fv.targetAnalyst) && (
          <span className="inline-flex items-center gap-1.5" style={{ color: "var(--terracotta)" }}>
            <span className="w-4 border-t-2 border-dotted" style={{ borderColor: "var(--terracotta)" }} /> Analistas {fmtMoney(fv.targetAnalyst)}
          </span>
        )}
        <button type="button" aria-pressed={showBB} onClick={() => setShowBB(!showBB)} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[0.7rem] font-bold ${showBB ? "border-terracotta" : "border-line text-ink-soft"}`}>
          <span className="w-4 h-2 rounded-sm" style={{ background: "var(--terracotta)", opacity: showBB ? 0.35 : 0.15 }} /> Bollinger (20, 2)
        </button>
        <button type="button" aria-pressed={showEma} onClick={() => setShowEma(!showEma)} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[0.7rem] font-bold ${showEma ? "border-ink" : "border-line text-ink-soft"}`}>
          <span className="w-3 border-t-2 border-dashed" style={{ borderColor: "var(--ink)" }} />EMA 200
        </button>
        {earn.length > 0 && <span className="text-ink-soft">R = resultados</span>}
        {divs.length > 0 && <span className="text-ink-soft">D = dividendo</span>}
      </div>
    </div>
  );
}
