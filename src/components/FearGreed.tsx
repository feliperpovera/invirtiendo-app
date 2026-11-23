"use client";

import { useEffect, useRef, useState } from "react";
import { zona, type PuntoValoracion } from "@/lib/analysis/valoracionSP";

const INDICES = [
  { symbol: "CNN", nombre: "S&P 500 · CNN" },
  { symbol: "^NDX", nombre: "Nasdaq-100" },
  { symbol: "^RUT", nombre: "Russell 2000" },
  { symbol: "^DJI", nombre: "Dow Jones" },
];
const PERIODOS = [["1M", 21], ["3M", 63], ["6M", 126], ["1A", 252], ["3A", 760]] as const;
const SEG = [
  { de: 0, a: 30, color: "#566043", label: "Miedo extremo" },
  { de: 30, a: 45, color: "#8b8d6f", label: "Miedo" },
  { de: 45, a: 55, color: "#cdbf9f", label: "Neutral" },
  { de: 55, a: 70, color: "#c46d34", label: "Codicia" },
  { de: 70, a: 100, color: "#8c2f1b", label: "Codicia extrema" },
];
const COLOR: Record<string, string> = { "miedo-extremo": "var(--sig-strong)", miedo: "var(--olive-deep)", neutral: "var(--ink-soft)", codicia: "var(--terracotta-deep)", "codicia-extrema": "var(--sig-avoid)" };
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

type Cnn = { score: number; previos: { cierre: number; semana: number; mes: number; anio: number }; serie: Array<{ t: number; nivel: number }>; componentes: Array<{ clave: string; nombre: string; score: number; rating: string; valor: number | null }> };

/** Velocímetro semicircular 0-100, como el de CNN. */
function Gauge({ v }: { v: number }) {
  const cx = 150, cy = 140, r = 110;
  const pt = (n: number, rr = r) => { const a = Math.PI * (1 - n / 100); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
  const arco = (de: number, a: number) => { const [x1, y1] = pt(de), [x2, y2] = pt(a); return `M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}`; };
  const [nx, ny] = pt(v, r - 22);
  const z = zona(v);
  return (
    <svg viewBox="0 0 300 175" className="w-full max-w-[340px]" role="img" aria-label={`Fear & Greed ${Math.round(v)}: ${z.label}`}>
      {SEG.map((s) => <path key={s.de} d={arco(s.de + 0.6, s.a - 0.6)} stroke={s.color} strokeWidth="26" fill="none" />)}
      {[0, 25, 50, 75, 100].map((n) => { const [x, y] = pt(n, r + 22); return <text key={n} x={x} y={y + 4} textAnchor="middle" fontSize="10" fill="var(--ink-soft)">{n}</text>; })}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" style={{ transition: "all .6s cubic-bezier(.2,.8,.2,1)" }} />
      <circle cx={cx} cy={cy} r="9" fill="var(--ink)" />
      <text x={cx} y={cy + 32} textAnchor="middle" className="num" fontSize="30" fontWeight="700" fill={COLOR[z.key]}>{Math.round(v)}</text>
    </svg>
  );
}

/** Fear & Greed estilo CNN para cuatro índices: velocímetro, lecturas pasadas y la historia por periodos (modelo Invirtiendo). */
export function FearGreed() {
  const [sym, setSym] = useState("CNN");
  const [cnn, setCnn] = useState<Cnn | null>(null);
  const [per, setPer] = useState<number>(252);
  const [datos, setDatos] = useState<Record<string, PuntoValoracion[]>>({});
  const [w, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (datos[sym]) return;
    if (sym === "CNN") {
      fetch("/api/fear-greed").then((r) => r.json()).then((j: Cnn) => {
        if (!j.serie) return;
        setCnn(j);
        setDatos((p) => ({ ...p, CNN: j.serie.map((x) => ({ t: x.t, nivel: x.nivel, sp: 0, comps: [0, 0, 0, 0] as [number, number, number, number] })) }));
      }).catch(() => {});
      return;
    }
    fetch(`/api/valoracion-sp500?symbol=${encodeURIComponent(sym)}&largo=1`).then((r) => r.json()).then((j) => j.serie && setDatos((p) => ({ ...p, [sym]: j.serie }))).catch(() => {});
  }, [sym, datos]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const todo = datos[sym] ?? [];
  const s = todo.slice(-per);
  const act = todo[todo.length - 1];
  const hace = (n: number) => todo[todo.length - 1 - n];
  const nombre = INDICES.find((i) => i.symbol === sym)!.nombre;

  const H = 230, L = 28, R = 8, T = 8, B = 22;
  const x = (i: number) => L + (i / Math.max(1, s.length - 1)) * (w - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const marcas = s.map((p, i) => ({ i, d: new Date(p.t) })).filter((m, k, a) => k > 0 && m.d.getUTCMonth() !== a[k - 1].d.getUTCMonth());
  const paso = Math.ceil(marcas.length / 12);
  const h = hover != null ? s[hover] : null;

  return (
    <section className="card p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Fear &amp; Greed Index · miedo o codicia</p>
          <p className="text-xs text-ink-soft mt-1 max-w-xl">¿Qué emoción mueve hoy al mercado? 0 = miedo extremo (precios baratos frente a su historia), 100 = codicia extrema.</p>
        </div>
        <div className="inline-flex flex-wrap rounded-full bg-ink p-1" role="group" aria-label="Índice">
          {INDICES.map((i) => (
            <button key={i.symbol} type="button" aria-pressed={sym === i.symbol} onClick={() => { setSym(i.symbol); setHover(null); }} className={`rounded-full px-3 py-1.5 text-xs sm:text-sm font-bold ${sym === i.symbol ? "bg-terracotta text-cream" : "text-[#d8cdb9] hover:text-cream"}`}>{i.nombre}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,340px)_1fr] items-center">
        <div className="flex flex-col items-center">
          {act ? <Gauge v={act.nivel} /> : <div className="skeleton h-44 w-full max-w-[340px]" />}
          {act && <p className="-mt-1 text-lg font-bold" style={{ color: COLOR[zona(act.nivel).key] }}>{zona(act.nivel).label}</p>}
          {act && <p className="text-xs text-ink-soft">{zona(act.nivel).accion}</p>}
        </div>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {([["Cierre anterior", 1], ["Hace 1 semana", 5], ["Hace 1 mes", 21], ["Hace 3 meses", 63], ["Hace 1 año", 252]] as const).map(([k, n]) => {
            const prev = cnn && sym === "CNN" ? { 1: cnn.previos.cierre, 5: cnn.previos.semana, 21: cnn.previos.mes, 252: cnn.previos.anio }[n as 1 | 5 | 21 | 252] : undefined;
            const p = prev != null ? { nivel: prev } : hace(n);
            const z = p ? zona(p.nivel) : null;
            return (
              <li key={k} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="text-ink-soft">{k}</span>
                {p && z ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: COLOR[z.key] }}>{z.label}</span>
                    <span className="num grid h-9 w-9 place-items-center rounded-full border-2 font-bold" style={{ borderColor: COLOR[z.key], color: COLOR[z.key] }}>{Math.round(p.nivel)}</span>
                  </span>
                ) : <span className="skeleton h-6 w-20" />}
              </li>
            );
          })}
        </ul>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[0.62rem] uppercase tracking-wider font-bold text-ink-soft">Historia del Fear &amp; Greed · {nombre}</p>
          <div className="inline-flex rounded-full border border-line p-0.5" role="group" aria-label="Periodo">
            {PERIODOS.map(([l, n]) => (
              <button key={l} type="button" aria-pressed={per === n} onClick={() => { setPer(n); setHover(null); }} className={`rounded-full px-3 py-1 text-xs font-bold ${per === n ? "bg-ink text-cream" : "text-ink-soft hover:text-ink"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div ref={ref} className="relative mt-2 select-none" style={{ touchAction: "pan-y" }} onPointerLeave={() => setHover(null)} onPointerMove={(e) => {
          const r = ref.current?.getBoundingClientRect();
          if (!r || s.length < 2) return;
          setHover(Math.max(0, Math.min(s.length - 1, Math.round(((e.clientX - r.left - L) / (w - L - R)) * (s.length - 1)))));
        }}>
          {w > 0 && s.length > 1 ? (
            <svg width={w} height={H} aria-label={`Historia del Fear & Greed del ${nombre}`}>
              {SEG.map((b) => <rect key={b.de} x={L} width={w - L - R} y={y(b.a)} height={y(b.de) - y(b.a)} fill={b.color} opacity="0.13" />)}
              {[30, 45, 55, 70].map((v) => <line key={v} x1={L} x2={w - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="4 4" />)}
              {[0, 25, 50, 75, 100].map((v) => <text key={v} x={L - 5} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--ink-soft)">{v}</text>)}
              {marcas.filter((_, k) => k % paso === 0).map((m) => (
                <text key={m.i} x={x(m.i)} y={H - 6} fontSize="10" fill="var(--ink-soft)" textAnchor="middle">{MES[m.d.getUTCMonth()]}{m.d.getUTCMonth() === 0 ? ` ${String(m.d.getUTCFullYear()).slice(2)}` : ""}</text>
              ))}
              <path d={`${s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.nivel).toFixed(1)}`).join("")}L${x(s.length - 1)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--ink)" opacity="0.05" />
              <path d={s.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.nivel).toFixed(1)}`).join("")} fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" />
              <circle cx={x(s.length - 1)} cy={y(s[s.length - 1].nivel)} r="5" fill="var(--terracotta)" stroke="var(--paper)" strokeWidth="2" />
              {h && <><line x1={x(hover!)} x2={x(hover!)} y1={T} y2={H - B} stroke="var(--ink)" opacity="0.3" /><circle cx={x(hover!)} cy={y(h.nivel)} r="4" fill="var(--ink)" /></>}
            </svg>
          ) : <div className="skeleton w-full" style={{ height: H }} />}
          {h && (
            <div className="pointer-events-none absolute top-1 rounded-xl border border-line bg-paper px-3 py-2 text-xs shadow-md" style={{ left: Math.min(Math.max(x(hover!) - 75, 0), w - 150), width: 150 }}>
              <p className="text-ink-soft">{new Date(h.t).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}</p>
              <p><b className="num" style={{ color: COLOR[zona(h.nivel).key] }}>{Math.round(h.nivel)}</b> · {zona(h.nivel).label}</p>
              {h.sp > 0 && <p className="text-ink-soft num">{nombre} {Math.round(h.sp).toLocaleString("en-US")}</p>}
            </div>
          )}
        </div>
      </div>
      {sym === "CNN" && cnn && (
        <div>
          <p className="text-[0.62rem] uppercase tracking-wider font-bold text-ink-soft mb-2">Los 7 indicadores que usa CNN</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {cnn.componentes.map((c) => {
              const z = zona(c.score);
              return (
                <li key={c.clave} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                  <span className="min-w-0">{c.nombre}{c.clave === "market_volatility_vix" && c.valor != null && <b className="num ml-1">· VIX {c.valor.toFixed(2)}</b>}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: COLOR[z.key] }}>{z.label}</span>
                    <span className="num font-bold" style={{ color: COLOR[z.key] }}>{Math.round(c.score)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-[0.68rem] text-ink-soft">{sym === "CNN" ? "Fuente: CNN Business Fear & Greed Index (7 indicadores: impulso, fuerza y amplitud de precios, opciones put/call, VIX, demanda de refugio y de bonos basura). " : ""}Nasdaq-100, Russell 2000 y Dow Jones: modelo Invirtiendo (inspirado en el de CNN): impulso frente a la media de 200 días, RSI, volatilidad implícita de cada índice (VIX, VXN, RVX, VXD) y distancia al máximo de 52 semanas, en percentiles de los últimos 2 años. Educativo, no es recomendación.</p>
    </section>
  );
}
