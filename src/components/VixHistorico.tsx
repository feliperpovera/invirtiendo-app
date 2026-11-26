"use client";

import { useEffect, useRef, useState } from "react";

import { ordenar } from "@/lib/orden";
import { SelectOrden, useOrden } from "./Orden";
import { BotonAvisoVix } from "./AlertaVix";

type Dia = readonly [number, number, number, number];
type Data = { actual: number | null; dias: Dia[]; picos: Array<{ t: number; v: number }> };
const RANGOS = [["1M", 1], ["3M", 3], ["6M", 6], ["1A", 12], ["5A", 60], ["20A", 0]] as const;
const diaLargo = (t: number) => new Date(t).toLocaleDateString("es-CO", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
const zona = (v: number) => (v >= 40 ? ["Pánico", "var(--sig-avoid)"] : v >= 30 ? ["Miedo", "var(--sig-avoid)"] : v >= 20 ? ["Nervios", "var(--sig-watch)"] : ["Calma", "var(--sig-strong)"]);
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fecha = (t: number) => { const d = new Date(t); return `${MES[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

/** VIX de 20 años con sus picos más altos como referencia. */
export function VixHistorico() {
  const [d, setD] = useState<Data | null>(null);
  useEffect(() => { fetch("/api/vix?v=2").then((r) => r.json()).then((j) => j.dias && setD(j)).catch(() => {}); }, []);
  const [rango, setRango] = useState<(typeof RANGOS)[number][0]>("1A");
  const [hover, setHover] = useState<number | null>(null);
  const ctl = useOrden<"v" | "t">("v", true);
  const caja = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(300);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- medir ya: el observador puede tardar en pestañas ocultas
    setW(el.clientWidth);
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [d]);
  const movil = W < 500, H = movil ? 260 : 280, L = 26, R = 12, T = 18, B = 22;
  if (!d) return <section className="rounded-2xl border border-line bg-paper p-4"><div className="skeleton w-full" style={{ height: H }} /></section>;
  const meses = RANGOS.find(([k]) => k === rango)![1];
  const fin = d.dias[d.dias.length - 1][0];
  const desde = meses ? fin - meses * 30.44 * 864e5 : 0;
  const p = d.dias.filter((q) => q[0] >= desde);
  const t0 = p[0][0], t1 = p[p.length - 1][0];
  const picos = d.picos.filter((q) => q.t >= t0);
  const max = Math.max(meses && meses <= 12 ? 40 : 90, ...p.map((q) => q[2])) * 1.08;
  const x = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const paso = max > 60 ? 20 : 10;
  const ejeY = Array.from({ length: Math.floor(max / paso) + 1 }, (_, i) => i * paso);
  // Marcas del eje X: años en rangos largos, meses en los cortos
  const marcas: Array<{ t: number; txt: string }> = [];
  const f0 = new Date(t0);
  if (!meses || meses > 12) {
    const cada = movil ? (meses ? 1 : 4) : meses ? 1 : 2;
    for (let a = f0.getUTCFullYear() + 1; Date.UTC(a, 0, 1) < t1; a += cada) marcas.push({ t: Date.UTC(a, 0, 1), txt: String(a) });
  } else {
    const cada = meses <= 1 ? 0 : meses <= 6 ? 1 : movil ? 3 : 2;
    if (!cada) for (let t = t0; t <= t1; t += 7 * 864e5) marcas.push({ t, txt: `${new Date(t).getUTCDate()} ${MES[new Date(t).getUTCMonth()]}` });
    else for (let m = 1; ; m += cada) { const t = Date.UTC(f0.getUTCFullYear(), f0.getUTCMonth() + m, 1); if (t >= t1) break; marcas.push({ t, txt: MES[new Date(t).getUTCMonth()] }); }
  }
  // Día más cercano al puntero (búsqueda binaria sobre las fechas)
  const elegir = (px: number) => {
    const t = t0 + ((px - L) / (W - L - R)) * (t1 - t0);
    let lo = 0, hi = p.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (p[m][0] < t) lo = m + 1; else hi = m; }
    setHover(lo > 0 && t - p[lo - 1][0] < p[lo][0] - t ? lo - 1 : lo);
  };
  const h = hover != null ? p[Math.min(hover, p.length - 1)] : null;
  const sobre30 = p.filter((q) => q[1] >= 30).length;
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-[0.62rem] uppercase tracking-wider font-bold text-ink-soft">VIX · índice del miedo · cierre diario</p>
          <p className="text-sm text-ink-soft">Menos de 20: calma · 20–30: nervios · más de 30: miedo · más de 40: pánico</p>
        </div>
        {d.actual != null && <p className="num text-3xl font-bold" style={{ color: d.actual >= 30 ? "var(--sig-avoid)" : d.actual >= 20 ? "var(--sig-watch)" : "var(--sig-strong)" }}>{d.actual.toFixed(2)}</p>}
      </div>
      <BotonAvisoVix />
      <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1">
        {RANGOS.map(([k]) => (
          <button key={k} type="button" aria-pressed={rango === k} onClick={() => { setRango(k); setHover(null); }} className={`rounded-full px-2.5 py-1 text-xs font-bold ${rango === k ? "bg-ink text-cream" : "border border-line text-ink-soft hover:border-ink"}`}>{k}</button>
        ))}
      </div>
      <div ref={caja} className="relative w-full overflow-hidden">
      {h && (() => {
        const [t, c, alto, bajo] = h;
        const [z, col] = zona(c);
        const izq = Math.min(Math.max(x(t) - 80, 0), W - 160);
        return (
          <div className="pointer-events-none absolute top-0 z-10 w-40 rounded-xl border border-line bg-paper px-3 py-2 text-xs shadow-md" style={{ left: izq }}>
            <p className="text-ink-soft capitalize">{diaLargo(t)}</p>
            <p><b className="num text-base" style={{ color: col }}>{c.toFixed(2)}</b> <span style={{ color: col }}>· {z}</span></p>
            <p className="num text-ink-soft">Máx {alto.toFixed(2)} · Mín {bajo.toFixed(2)}</p>
          </div>
        );
      })()}
      <svg width={W} height={H} aria-label={`VIX diario, periodo ${rango}; pasa el dedo o el mouse para ver cada día`} className="touch-pan-y cursor-crosshair"
        onPointerMove={(e) => elegir(e.clientX - e.currentTarget.getBoundingClientRect().left)}
        onPointerDown={(e) => elegir(e.clientX - e.currentTarget.getBoundingClientRect().left)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}>
        {[20, 30, 40].map((v) => <line key={v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 20 ? "var(--line)" : "var(--terracotta)"} strokeDasharray="4 4" opacity={v === 20 ? 1 : 0.5} />)}
        {[20, 30, 40].map((v) => v < max && <rect key={`z${v}`} x={L} width={W - L - R} y={y(v === 40 ? max : v === 30 ? 40 : 30)} height={y(v) - y(v === 40 ? max : v === 30 ? Math.min(40, max) : 30)} fill="var(--terracotta)" opacity={v === 20 ? 0 : v === 30 ? 0.06 : 0.11} />)}
        {ejeY.map((v) => <text key={v} x={L - 5} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--ink-soft)">{v}</text>)}
        {marcas.map((m) => <text key={m.t} x={x(m.t)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--ink-soft)">{m.txt}</text>)}
        <path d={p.map((q, i) => `${i ? "L" : "M"}${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`).join("")} fill="none" stroke="var(--ink)" strokeWidth={meses && meses <= 6 ? 1.8 : 1.2} strokeLinejoin="round" />
        {picos.map((q) => (
          <g key={q.t}>
            <circle cx={x(q.t)} cy={y(q.v)} r="3.5" fill="var(--terracotta)" />
            <text x={x(q.t)} y={y(q.v) - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--ink)">{Math.round(q.v)}</text>
          </g>
        ))}
        {h && <><line x1={x(h[0])} x2={x(h[0])} y1={T} y2={H - B} stroke="var(--ink)" opacity="0.35" /><circle cx={x(h[0])} cy={y(h[1])} r="4" fill="var(--ink)" /></>}
        <circle cx={x(t1)} cy={y(p[p.length - 1][1])} r="5" fill="var(--terracotta)" stroke="var(--paper)" strokeWidth="2" />
      </svg>
      </div>
      <p className="text-xs text-ink-soft">Pasa el mouse o el dedo por la gráfica para ver el VIX de cada día. En este periodo cerró en 30 o más <b className="num text-ink">{sobre30}</b> de {p.length} días ({((sobre30 / p.length) * 100).toFixed(0)}%).</p>
      <SelectOrden ctl={ctl} opciones={[["v", "Nivel del pico"], ["t", "Fecha"]]} />
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ordenar(d.picos, (q) => q[ctl.o.k], ctl.o.desc).map((q) => (
          <li key={q.t} className="rounded-xl border border-line px-3 py-2 text-xs">
            <b className="num text-base">{q.v.toFixed(1)}</b> <span className="text-ink-soft">· {fecha(q.t)}</span>
          </li>
        ))}
      </ul>
      <p className="text-[0.68rem] text-ink-soft">Línea = cierre de cada día. Picos (20 años): máximo intradía del día, uno por episodio. Fuente: Yahoo Finance (^VIX). Educativo, no es recomendación.</p>
    </section>
  );
}
