"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PricePoint } from "@/lib/analysis/types";
import { Card, Eyebrow } from "./ui";
import { ordenar } from "@/lib/orden";
import { SelectOrden, useOrden } from "./Orden";
import { TickerLogo } from "./TickerLogo";
import { fmtMoney, fmtPct } from "@/lib/format";

const RANGOS = ["1D", "1S", "1M", "3M", "6M", "YTD", "1A"] as const;
type Serie = { base: number | null; points: PricePoint[] } | null;

/** Mini gráfica de velas (o área si la fuente no trae apertura/máx/mín) con línea base punteada y marcas de nuestras compras/ventas. */
function Mini({ s, ops }: { s: Serie; ops: Array<{ t: number; venta: boolean }> }) {
  if (!s || s.points.length < 2) return <div className="skeleton h-20 w-full" />;
  const W = 300, H = 80;
  const velas = s.points.every((p) => p.o != null);
  const ys = s.points.flatMap((p) => (velas ? [p.h!, p.l!] : [p.c])).concat(s.base ? [s.base] : []);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const t0 = s.points[0].t, t1 = s.points[s.points.length - 1].t;
  const X = (t: number) => ((t - t0) / (t1 - t0 || 1)) * W;
  const Y = (v: number) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 8);
  const d = s.points.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.c).toFixed(1)}`).join("");
  const ult = s.points[s.points.length - 1].c;
  const sube = ult >= (s.base ?? s.points[0].c);
  const col = sube ? "var(--sig-strong)" : "var(--sig-avoid)";
  const enRango = ops.filter((o) => o.t >= t0 && o.t <= t1);
  const cerca = (t: number) => s.points.reduce((a, p) => (Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-20 w-full" aria-hidden>
      {!velas && <path d={`${d}L${W},${H}L0,${H}Z`} fill={col} opacity="0.12" />}
      {s.base && <line x1="0" x2={W} y1={Y(s.base)} y2={Y(s.base)} stroke="var(--ink-soft)" strokeDasharray="3 3" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.6" />}
      {velas
        ? s.points.map((p) => {
            const c = p.c >= p.o! ? "var(--sig-strong)" : "var(--sig-avoid)";
            const bw = (W / s.points.length) * 0.65;
            const top = Y(Math.max(p.o!, p.c));
            return (
              <g key={p.t}>
                <line x1={X(p.t)} x2={X(p.t)} y1={Y(p.h!)} y2={Y(p.l!)} stroke={c} strokeWidth="1" vectorEffect="non-scaling-stroke" />
                <rect x={X(p.t) - bw / 2} width={bw} y={top} height={Math.max(0.8, Y(Math.min(p.o!, p.c)) - top)} fill={c} />
              </g>
            );
          })
        : <path d={d} fill="none" stroke={col} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />}
      {enRango.map((o, i) => {
        const p = cerca(o.t);
        return <circle key={i} cx={X(p.t)} cy={Y(p.c)} r="4" fill={o.venta ? "var(--terracotta)" : "var(--olive-deep)"} stroke="var(--paper)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />;
      })}
    </svg>
  );
}

/** Cada posición del portafolio en su propia gráfica, sobre la misma línea de tiempo que la cuenta. */
export function PosicionesGraficas({ tickers, movimientos }: { tickers: string[]; movimientos: Array<{ fecha: string; ticker: string; tipo: string }> }) {
  const [rango, setRango] = useState<(typeof RANGOS)[number]>("1M");
  const [series, setSeries] = useState<Record<string, Serie>>({});
  useEffect(() => {
    let vivo = true;
    const cargar = () => fetch(`/api/series?rango=${rango}&symbols=${tickers.join(",")}`).then((r) => r.json()).then((j) => vivo && setSeries(j)).catch(() => {});
    setSeries({});
    cargar();
    const t = rango === "1D" ? setInterval(cargar, 60_000) : undefined;
    return () => {
      vivo = false;
      if (t) clearInterval(t);
    };
  }, [rango, tickers]);

  const ctl = useOrden<"valor" | "ticker" | "precio" | "cambio">("valor", true, ["ticker"]);
  const vista = ordenar(tickers, (t) => {
    const pts = series[t]?.points, u = pts?.at(-1)?.c, b = series[t]?.base ?? pts?.[0]?.c;
    return ctl.o.k === "ticker" ? t : ctl.o.k === "precio" ? u : ctl.o.k === "cambio" ? (u != null && b ? u / b - 1 : null) : -tickers.indexOf(t);
  }, ctl.o.desc);
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <Eyebrow>Cada acción, una a una</Eyebrow>
        <SelectOrden ctl={ctl} opciones={[["valor", "Posición"], ["ticker", "Acción"], ["precio", "Precio"], ["cambio", "Cambio %"]]} />
        <div role="group" aria-label="Periodo" className="flex flex-wrap gap-1">
          {RANGOS.map((r) => (
            <button key={r} type="button" aria-pressed={rango === r} onClick={() => setRango(r)} className={`rounded-full px-2.5 py-1 text-xs font-bold ${rango === r ? "bg-ink text-cream" : "border border-line text-ink-soft hover:border-ink"}`}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {vista.map((t) => {
          const s = series[t];
          const ult = s?.points.at(-1)?.c ?? null;
          const base = s?.base ?? s?.points[0]?.c ?? null;
          const cambio = ult != null && base ? (ult / base - 1) * 100 : null;
          const ops = movimientos.filter((m) => m.ticker === t).map((m) => ({ t: Date.parse(`${m.fecha}T16:00:00Z`), venta: m.tipo === "venta" }));
          return (
            <Card key={t} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/accion/${t}`} className="flex items-center gap-2 font-bold hover:text-terracotta">
                  <TickerLogo symbol={t} size={24} />
                  {t}
                </Link>
                <span className="text-right leading-tight">
                  <span className="num block text-sm font-bold">{fmtMoney(ult)}</span>
                  <span className="num text-xs font-bold" style={{ color: (cambio ?? 0) >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>{fmtPct(cambio, 2, true)}</span>
                </span>
              </div>
              <Mini s={s ?? null} ops={ops} />
            </Card>
          );
        })}
      </div>
      <p className="text-xs text-ink-soft mt-2">Línea punteada = precio al inicio del periodo. Puntos: <b className="text-olive-deep">● compra</b> y <b className="text-terracotta">● venta</b> nuestras dentro del periodo.</p>
    </section>
  );
}
