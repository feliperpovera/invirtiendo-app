"use client";

import { useEffect, useState } from "react";
import type { MarketPulse as MP } from "@/lib/analysis/types";
import { Card, Eyebrow, Delta } from "./ui";
import { fmtNum, fmtPct, timeAgo, isNum } from "@/lib/format";
import { FUENTE_URL } from "@/lib/atribucion";

function MoodDial({ score, label }: { score: number; label: string }) {
  // Semicírculo 0-100 → −90°..+90°
  const angle = -90 + (score / 100) * 180;
  const r = 60;
  const cx = 70;
  const cy = 70;
  const arc = (from: number, to: number, color: string) => {
    const a0 = ((from / 100) * 180 - 180) * (Math.PI / 180);
    const a1 = ((to / 100) * 180 - 180) * (Math.PI / 180);
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    return <path key={from} d={`M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`} stroke={color} strokeWidth="12" fill="none" strokeLinecap="butt" />;
  };
  return (
    <div className="flex flex-col items-center">
      <svg width="140" height="84" viewBox="0 0 140 84" role="img" aria-label={`Ánimo del mercado: ${label}, ${score} de 100`}>
        {arc(0, 25, "var(--sig-avoid)")}
        {arc(25, 45, "var(--sig-wait)")}
        {arc(45, 55, "var(--sig-watch)")}
        {arc(55, 75, "var(--sig-good)")}
        {arc(75, 100, "var(--sig-strong)")}
        <g transform={`rotate(${angle} ${cx} ${cy})`}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 4} stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx={cx} cy={cy} r="5" fill="var(--ink)" />
      </svg>
      <span className="font-display text-2xl leading-none -mt-1">{score}</span>
      <span className="text-xs font-bold uppercase tracking-wider text-ink-soft mt-1">{label}</span>
    </div>
  );
}

export function MarketPulseCard() {
  const [d, setD] = useState<MP | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/market")
        .then((r) => r.json())
        .then((j) => alive && (j.error ? setErr(j.error) : setD(j)))
        .catch((e) => alive && setErr(String(e)));
    load();
    const t = setInterval(load, 120000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <Card ink className="rise">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Eyebrow>Pulso del mercado</Eyebrow>
          <h2 className="font-display text-2xl sm:text-3xl mt-1">Ajusta el ritmo, no tu estrategia.</h2>
        </div>
        {d && <span className="text-xs muted">Actualizado {timeAgo(d.asOf)} · precios con retraso</span>}
      </div>
      {err && <p className="mt-4 text-sm text-[#e0a074]">No pude leer el mercado ahora mismo: {err}</p>}
      {!d && !err && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-16 opacity-30" />
          ))}
        </div>
      )}
      {d && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            {d.indices.map((i) => (
              <div key={i.symbol}>
                <p className="text-[0.7rem] uppercase tracking-[0.12em] font-bold muted">{i.name}</p>
                <p className="num text-lg font-bold leading-tight">{fmtNum(i.price, i.price > 1000 ? 0 : 2)}</p>
                <p className="text-xs">
                  <Delta v={i.changePct} /> <span className="muted">· YTD</span> <Delta v={i.ytdPct} digits={1} />
                </p>
              </div>
            ))}
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.12em] font-bold muted">VIX</p>
              <p className="num text-lg font-bold leading-tight">{d.vix.value.toFixed(1)}</p>
              <p className="text-xs muted">{d.vix.label} · &lt;14 complacencia · &gt;25 miedo</p>
            </div>
            <div>
              <p className="text-[0.7rem] uppercase tracking-[0.12em] font-bold muted">Tesoro 10 años</p>
              <p className="num text-lg font-bold leading-tight">{fmtPct(d.tenYear, 2)}</p>
              <p className="text-xs muted">El rival de las acciones</p>
              {d.curve && isNum(d.curve.spread10y2y) && (
                <p className="text-xs muted mt-1">
                  Curva 10a − 2a <span className="num text-cream">{d.curve.spread10y2y > 0 ? "+" : ""}{d.curve.spread10y2y.toFixed(2)} pp</span>{" · "}
                  {d.curve.spread10y2y < 0 ? "invertida" : d.curve.spread10y2y < 0.5 ? "plana" : "normal"}{" · "}
                  <a href={FUENTE_URL.xoomarMacro} target="_blank" rel="noopener noreferrer" className="underline hover:text-cream">XOOMAR</a>
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-5 lg:border-l lg:border-[#3a3831] lg:pl-6">
            <MoodDial score={d.mood.score} label={d.mood.label} />
            <div className="max-w-[16rem]">
              <p className="text-sm leading-snug">{d.mood.advice}</p>
              <ul className="mt-2 space-y-0.5 text-[0.7rem] muted">
                {d.mood.components.map((c) => (
                  <li key={c.key} className="flex justify-between gap-3">
                    <span>{c.label}</span>
                    <span className="num text-cream">{c.value}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[0.68rem] muted mt-2">Fear &amp; Greed Index (CNN) · Fear ≠ compra automática · Greed ≠ venta automática</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
