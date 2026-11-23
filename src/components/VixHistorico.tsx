"use client";

import { useEffect, useState } from "react";

type Data = { actual: number | null; puntos: Array<{ t: number; c: number }>; picos: Array<{ t: number; v: number }> };
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (t: number) => { const d = new Date(t); return `${MES[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/** VIX de 20 años con sus picos más altos como referencia. */
export function VixHistorico() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { fetch("/api/vix").then((r) => r.json()).then((j) => j.puntos && setD(j)).catch(() => {}); }, []);
  const W = 800, H = 280, L = 32, R = 10, T = 16, B = 22;
  if (!d) return <section className="rounded-2xl border border-line bg-paper p-4"><div className="skeleton w-full" style={{ height: H }} /></section>;
  const p = d.puntos, t0 = p[0].t, t1 = p[p.length - 1].t, max = Math.max(90, ...d.picos.map((q) => q.v));
  const x = (t: number) => L + ((t - t0) / (t1 - t0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const anios = Array.from({ length: 30 }, (_, i) => Date.UTC(new Date(t0).getUTCFullYear() + i, 0, 1)).filter((t) => t > t0 && t < t1);
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[0.62rem] uppercase tracking-wider font-bold text-ink-soft">VIX · índice del miedo · 20 años</p>
          <p className="text-sm text-ink-soft">Menos de 20: calma · 20–30: nervios · más de 30: miedo · más de 40: pánico</p>
        </div>
        {d.actual != null && <p className="num text-3xl font-bold" style={{ color: d.actual >= 30 ? "var(--sig-avoid)" : d.actual >= 20 ? "var(--sig-watch)" : "var(--sig-strong)" }}>{d.actual.toFixed(2)}</p>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" aria-label="Historia del VIX de 20 años con sus picos">
        {[20, 30, 40].map((v) => <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 20 ? "var(--line)" : "var(--terracotta)"} strokeDasharray="4 4" opacity={v === 20 ? 1 : 0.5} />)}
        {[0, 20, 40, 60, 80].map((v) => <text key={v} x={L - 5} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--ink-soft)">{v}</text>)}
        {anios.filter((_, i) => i % 2 === 0).map((t) => <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ink-soft)">{new Date(t).getUTCFullYear()}</text>)}
        <path d={p.map((q, i) => `${i ? "L" : "M"}${x(q.t).toFixed(1)},${y(q.c).toFixed(1)}`).join("")} fill="none" stroke="var(--ink)" strokeWidth="1.3" strokeLinejoin="round" />
        {d.picos.map((q) => (
          <g key={q.t}>
            <circle cx={x(q.t)} cy={y(q.v)} r="3.5" fill="var(--terracotta)" />
            <text x={x(q.t)} y={y(q.v) - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)">{Math.round(q.v)}</text>
          </g>
        ))}
        <circle cx={x(t1)} cy={y(p[p.length - 1].c)} r="5" fill="var(--terracotta)" stroke="var(--paper)" strokeWidth="2" />
      </svg>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[...d.picos].sort((a, b) => b.v - a.v).map((q) => (
          <li key={q.t} className="rounded-xl border border-line px-3 py-2 text-xs">
            <b className="num text-base">{q.v.toFixed(1)}</b> <span className="text-ink-soft">· {fecha(q.t)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[0.68rem] text-ink-soft">Picos: máximo intradía de la semana, uno por episodio. Fuente: Yahoo Finance (^VIX). Educativo, no es recomendación.</p>
    </section>
  );
}
