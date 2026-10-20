"use client";

import { useEffect, useRef, useState } from "react";
import type { PuntoValoracion } from "@/lib/analysis/valoracionSP";
import { Card, Eyebrow } from "./ui";

type Datos = { asOf: number; actual: PuntoValoracion & { zona: { key: string; label: string; accion: string } }; serie: PuntoValoracion[] };
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Bandas: de abajo (barato, oliva) a arriba (caro, ladrillo), como el semáforo de la marca
const BANDAS = [
  { de: 0, a: 30, color: "#6b6e55", op: 0.28, label: "Miedo extremo" },
  { de: 30, a: 45, color: "#8b8d6f", op: 0.18, label: "Miedo" },
  { de: 45, a: 55, color: "#d9cbb3", op: 0.25, label: "Neutral" },
  { de: 55, a: 70, color: "#c46d34", op: 0.14, label: "Codicia" },
  { de: 70, a: 100, color: "#8c2f1b", op: 0.18, label: "Codicia extrema" },
];
const COLOR_ZONA: Record<string, string> = { "miedo-extremo": "var(--sig-strong)", miedo: "var(--olive-deep)", neutral: "var(--ink-soft)", codicia: "var(--terracotta-deep)", "codicia-extrema": "var(--sig-avoid)" };

/** Indicador de valoración del S&P 500 con zonas de compra (estilo RankingStock, modelo Invirtiendo). */
export function ValoracionSP() {
  const [d, setD] = useState<Datos | null>(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch("/api/valoracion-sp500").then((r) => r.json()).then((j) => !j.error && setD(j)).catch(() => {});
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 240, H2 = 90, L = 30, R = 10, T = 8, B = 22;
  const s = d?.serie ?? [];
  const x = (i: number) => L + (i / Math.max(1, s.length - 1)) * (w - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const spMin = Math.min(...s.map((p) => p.sp)), spMax = Math.max(...s.map((p) => p.sp));
  const y2 = (v: number) => 6 + (1 - (v - spMin) / (spMax - spMin || 1)) * (H2 - 12);
  const meses = s.map((p, i) => ({ i, d: new Date(p.t) })).filter((m, k, a) => k === 0 || m.d.getUTCMonth() !== a[k - 1].d.getUTCMonth());
  const h = hover != null ? s[hover] : null;
  const act = d?.actual;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Valoración del S&amp;P 500 · ¿momento de compra?</Eyebrow>
          <p className="text-xs text-ink-soft mt-1 max-w-xl">0 = el mercado más barato de los últimos 2 años, 100 = el más caro. Combina distancia a la media de 200 días, RSI, VIX y caída desde el máximo.</p>
        </div>
        {act && (
          <div className="text-right">
            <p className="num font-display text-4xl leading-none" style={{ color: COLOR_ZONA[act.zona.key] }}>{Math.round(act.nivel)}</p>
            <p className="text-sm font-bold" style={{ color: COLOR_ZONA[act.zona.key] }}>{act.zona.label}</p>
            <p className="text-xs text-ink-soft">{act.zona.accion}</p>
          </div>
        )}
      </div>
      <div ref={ref} className="relative mt-3 select-none" onPointerLeave={() => setHover(null)} onPointerMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r || s.length < 2) return;
        setHover(Math.max(0, Math.min(s.length - 1, Math.round(((e.clientX - r.left - L) / (w - L - R)) * (s.length - 1)))));
      }} style={{ touchAction: "pan-y" }}>
        {w > 0 && s.length > 1 ? (
          <>
            <svg width={w} height={H} role="img" aria-label={`Indicador de valoración del S&P 500: ${act ? Math.round(act.nivel) : ""}, ${act?.zona.label ?? ""}`}>
              {BANDAS.map((b) => (
                <rect key={b.de} x={L} width={w - L - R} y={y(b.a)} height={y(b.de) - y(b.a)} fill={b.color} opacity={b.op} />
              ))}
              {[30, 45, 55, 70].map((v) => (
                <line key={v} x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke={v <= 45 ? "#566043" : "#8c2f1b"} strokeDasharray="5 4" strokeWidth="1" opacity="0.7" />
              ))}
              {[0, 30, 45, 55, 70, 100].map((v) => (
                <text key={v} x={L - 5} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--ink-soft)">{v}</text>
              ))}
              {meses.map((m) => (
                <text key={m.i} x={x(m.i)} y={H - 6} fontSize="10" fill="var(--ink-soft)" textAnchor="middle">{MES[m.d.getUTCMonth()]}</text>
              ))}
              <path d={s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.nivel).toFixed(1)}`).join("")} fill="none" stroke="var(--ink)" strokeWidth="1.6" />
              {s.map((p, i) => (i % 3 === 0 || i === s.length - 1 ? <circle key={i} cx={x(i)} cy={y(p.nivel)} r="2.2" fill="var(--ink)" /> : null))}
              <circle cx={x(s.length - 1)} cy={y(s[s.length - 1].nivel)} r="5" fill="var(--terracotta)" stroke="var(--paper)" strokeWidth="2" />
              {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--ink)" opacity="0.3" />}
            </svg>
            <p className="text-[0.62rem] uppercase tracking-wider text-ink-soft font-bold mt-2">S&amp;P 500 en el mismo periodo</p>
            <svg width={w} height={H2} aria-hidden>
              <path d={s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y2(p.sp).toFixed(1)}`).join("")} fill="none" stroke="var(--terracotta)" strokeWidth="1.6" />
              {s.map((p, i) => (p.nivel < 30 ? <circle key={i} cx={x(i)} cy={y2(p.sp)} r="2.4" fill="var(--sig-strong)" /> : null))}
              {hover != null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H2} stroke="var(--ink)" opacity="0.3" />}
            </svg>
            {h && (
              <div className="pointer-events-none absolute top-1 rounded-xl border border-line bg-paper px-3 py-2 text-xs shadow-md" style={{ left: Math.min(Math.max(x(hover!) - 80, 0), w - 170), width: 170 }}>
                <p className="text-ink-soft">{new Date(h.t).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}</p>
                <p>Nivel <b className="num">{Math.round(h.nivel)}</b> · S&amp;P <b className="num">{Math.round(h.sp).toLocaleString("en-US")}</b></p>
                <p className="text-ink-soft num">200d {Math.round(h.comps[0])} · RSI {Math.round(h.comps[1])} · VIX {Math.round(h.comps[2])} · Máx {Math.round(h.comps[3])}</p>
              </div>
            )}
          </>
        ) : (
          <div className="skeleton w-full" style={{ height: H + H2 + 20 }} />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-ink-soft">
        {BANDAS.map((b) => (
          <span key={b.de} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm" style={{ background: b.color, opacity: Math.min(1, b.op * 3) }} />
            {b.label} {b.de}–{b.a}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--sig-strong)" }} /> días en miedo extremo sobre el S&amp;P</span>
      </div>
      <p className="text-[0.68rem] text-ink-soft mt-2">Historia 2021-2026: con el indicador bajo 30 el S&amp;P subió en promedio +15% en los 6 meses siguientes; entre 30 y 45, +12%; en neutral o codicia, ~7%. Educativo, no es recomendación.</p>
    </Card>
  );
}
