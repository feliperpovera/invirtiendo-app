"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { RankingRow } from "@/lib/providers/ranking";
import type { SignalKey } from "@/lib/analysis/types";
import { Card, SignalPill } from "./ui";
import { TickerLogo } from "./TickerLogo";
import { fmtBig, fmtMoney, fmtPct, isNum } from "@/lib/format";

const colorMos = (mos: number | null) => (isNum(mos) ? (mos >= 15 ? "var(--sig-strong)" : mos >= -10 ? "var(--sig-watch)" : "var(--sig-avoid)") : undefined);

const SENALES: Array<[string, string]> = [["strong", "Strong Buy"], ["good", "Buy Zone"], ["watch", "Watch"], ["wait", "Wait"], ["avoid", "Avoid"]];
const CAPS: Array<[string, number]> = [["Todas", 0], [">$10B", 1e10], [">$100B", 1e11], [">$1T", 1e12]];
type Orden = "score" | "mos" | "fwd_pe" | "market_cap" | "precio" | "grade" | "senal";
const PESO_NOTA: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, F: 1 };
const PESO_SENAL: Record<string, number> = { strong: 5, good: 4, watch: 3, wait: 2, avoid: 1 };
const RANKEAR: Array<[Orden, string]> = [["score", "Score Invirtiendo"], ["mos", "Margen de seguridad"], ["grade", "Calificación"], ["senal", "Señal"]];
/** Valor numérico para ordenar: nota y señal se pasan a escala; empata por score. */
const valorOrden = (f: RankingRow, k: Orden) => (k === "grade" ? (PESO_NOTA[f.grade ?? ""] ?? 0) * 1000 + f.score : k === "senal" ? (PESO_SENAL[f.senal_key ?? ""] ?? 0) * 1000 + (f.mos ?? -999) / 1000 + f.score : (f[k] as number | null));

/**
 * Ranking + screener (al estilo TradingView) sobre NUESTROS cálculos: señal, margen de seguridad, score y nota.
 * Los 5 primeros en tarjetas; la tabla filtra y ordena en el navegador.
 */
export function Ranking({ filas }: { filas: RankingRow[] }) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [senales, setSenales] = useState<string[]>([]);
  const [mosMin, setMosMin] = useState(-100);
  const [peMax, setPeMax] = useState(0);
  const [capMin, setCapMin] = useState(0);
  const [nota, setNota] = useState("");
  const [orden, setOrden] = useState<{ k: Orden; desc: boolean }>({ k: "score", desc: true });
  const sectores = useMemo(() => [...new Set(filas.map((f) => f.sector).filter(Boolean) as string[])].sort(), [filas]);
  const vista = useMemo(() => {
    const t = q.trim().toUpperCase();
    return filas
      .filter((f) => !t || f.ticker.includes(t) || (f.nombre ?? "").toUpperCase().includes(t))
      .filter((f) => !sector || f.sector === sector)
      .filter((f) => !senales.length || senales.includes(f.senal_key ?? ""))
      .filter((f) => mosMin <= -100 || (isNum(f.mos) && f.mos >= mosMin))
      .filter((f) => !peMax || (isNum(f.fwd_pe) && f.fwd_pe > 0 && f.fwd_pe <= peMax))
      .filter((f) => !capMin || (isNum(f.market_cap) && f.market_cap >= capMin))
      .filter((f) => !nota || (f.grade ?? "") <= nota)
      .sort((a, b) => {
        const x = valorOrden(a, orden.k) ?? -Infinity, y = valorOrden(b, orden.k) ?? -Infinity;
        return (orden.desc ? -1 : 1) * ((x as number) - (y as number));
      });
  }, [filas, q, sector, senales, mosMin, peMax, capMin, nota, orden]);
  if (!filas.length) return <p className="text-sm text-ink-soft">Todavía no hay acciones evaluadas.</p>;
  const filtrado = vista.length !== filas.length;
  const th = (k: Orden, label: string) => (
    <th className="num">
      <button type="button" className="uppercase tracking-wider hover:text-terracotta" onClick={() => setOrden((o) => ({ k, desc: o.k === k ? !o.desc : true }))}>
        {label} {orden.k === k ? (orden.desc ? "▼" : "▲") : ""}
      </button>
    </th>
  );
  const limpiar = () => { setQ(""); setSector(""); setSenales([]); setMosMin(-100); setPeMax(0); setCapMin(0); setNota(""); };

  const conteo = (k: string) => filas.filter((f) => f.senal_key === k).length;
  const segmento = senales.length === 1 ? senales[0] : "";
  const nombreOrden = RANKEAR.find(([k]) => k === orden.k)?.[1] ?? "";

  return (
    <div className="space-y-5">
      {/* Segmentar y rankear: lo primero que se elige */}
      <div className="card p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.65rem] uppercase tracking-wider font-bold text-ink-soft w-24 shrink-0">Segmento</span>
          {[["", "Todas", filas.length] as const, ...SENALES.map(([k, l]) => [k, l, conteo(k)] as const)].map(([k, l, n]) => (
            <button key={k || "todas"} type="button" aria-pressed={segmento === k && (k !== "" || !senales.length)} onClick={() => setSenales(k ? [k] : [])} className={`pill border text-xs ${(k ? segmento === k : !senales.length) ? "bg-ink text-cream border-ink" : "border-line text-ink-soft hover:border-ink"}`}>
              {l} <span className="num opacity-70">{n}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.65rem] uppercase tracking-wider font-bold text-ink-soft w-24 shrink-0">Rankear por</span>
          {RANKEAR.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={orden.k === k} onClick={() => setOrden({ k, desc: true })} className={`pill border text-xs ${orden.k === k ? "bg-terracotta text-cream border-terracotta" : "border-line text-ink-soft hover:border-terracotta"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <p className="eyebrow">Top 5 · {segmento ? SENALES.find(([k]) => k === segmento)?.[1] : "todas"} · por {nombreOrden.toLowerCase()}</p>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {vista.slice(0, 5).map((r, i) => (
          <Link key={r.ticker} href={`/accion/${r.ticker}`} className="card p-4 hover:border-terracotta transition-colors">
            <div className="flex items-start justify-between gap-2">
              <span className="font-display text-3xl leading-none text-terracotta">{i + 1}</span>
              {r.senal_key && r.senal && <SignalPill k={r.senal_key as SignalKey} label={r.senal} />}
            </div>
            <p className="font-bold text-lg mt-3 leading-tight">{r.ticker}</p>
            <p className="text-xs text-ink-soft truncate">{r.nombre ?? ""}</p>
            <p className="mt-3">
              <span className="font-display text-3xl leading-none">{r.score}</span>
              <span className="text-xs text-ink-soft ml-1">{r.grade}</span>
            </p>
            <p className="text-xs num mt-2">
              {fmtMoney(r.precio)} · FV {fmtMoney(r.fair_value)}
            </p>
            <p className="text-xs num text-ink-soft">Cap. {fmtBig(r.market_cap)}</p>
            <p className="text-xs num" style={{ color: colorMos(r.mos) }}>
              {fmtPct(r.mos, 0, true)} margen
            </p>
          </Link>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input className="input py-1.5 text-sm !w-40" placeholder="Ticker o nombre" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el screener" />
          <select className="input py-1.5 text-sm !w-auto" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
            <option value="">Todos los sectores</option>
            {sectores.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select className="input py-1.5 text-sm !w-auto" value={capMin} onChange={(e) => setCapMin(Number(e.target.value))} aria-label="Capitalización mínima">
            {CAPS.map(([l, v]) => <option key={l} value={v}>Cap. {l}</option>)}
          </select>
          <select className="input py-1.5 text-sm !w-auto" value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota mínima">
            <option value="">Cualquier nota</option>
            <option value="A">Nota A</option>
            <option value="B">Nota B o mejor</option>
            <option value="C">Nota C o mejor</option>
          </select>
          {filtrado && <button type="button" onClick={limpiar} className="text-xs underline text-ink-soft ml-auto">Limpiar filtros</button>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <label className="flex items-center gap-2">
            <span className="w-36 shrink-0 text-ink-soft">Margen de seguridad ≥ <b className="num text-ink">{mosMin <= -100 ? "cualquiera" : `${mosMin}%`}</b></span>
            <input type="range" min={-100} max={60} step={5} value={mosMin} onChange={(e) => setMosMin(Number(e.target.value))} className="flex-1 accent-[var(--terracotta)]" />
          </label>
          <label className="flex items-center gap-2">
            <span className="w-36 shrink-0 text-ink-soft">Fwd P/E ≤ <b className="num text-ink">{peMax ? `${peMax}x` : "cualquiera"}</b></span>
            <input type="range" min={0} max={60} step={5} value={peMax} onChange={(e) => setPeMax(Number(e.target.value))} className="flex-1 accent-[var(--terracotta)]" />
          </label>
        </div>
        <p className="text-xs text-ink-soft">{vista.length} de {filas.length} acciones · ordena con un clic en la columna</p>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="scroll-x">
          <table className="table table-compacta w-full text-sm min-w-[640px] lg:min-w-0">
            <thead>
              <tr>
                <th>#</th>
                <th>Acción</th>
                <th className="hidden 2xl:table-cell">Sector</th>
                {th("score", "Score")}
                <th>Señal</th>
                {th("precio", "Precio")}
                {th("market_cap", "Cap. mercado")}
                {th("fwd_pe", "Fwd P/E")}
                <th className="num">Fair Value</th>
                {th("mos", "Margen")}
              </tr>
            </thead>
            <tbody>
              {vista.map((r, i) => (
                <tr key={r.ticker}>
                  <td className="num font-display text-lg text-ink-soft w-8">{i + 1}</td>
                  <td>
                    <Link href={`/accion/${r.ticker}`} className="font-bold hover:text-terracotta inline-flex items-center gap-1.5">
                      <TickerLogo symbol={r.ticker} size={20} />
                      {r.ticker}
                    </Link>
                    <div className="text-xs text-ink-soft truncate max-w-[11rem]">{r.nombre ?? ""}</div>
                    <div className="text-[0.65rem] text-ink-soft 2xl:hidden truncate max-w-[11rem]">{r.sector ?? ""}</div>
                  </td>
                  <td className="hidden 2xl:table-cell text-xs text-ink-soft whitespace-nowrap">{r.sector ?? "—"}</td>
                  <td className="num">
                    <span className="font-display text-xl leading-none">{r.score}</span>
                    <span className="text-xs text-ink-soft ml-1">{r.grade}</span>
                  </td>
                  <td>{r.senal_key && r.senal ? <SignalPill k={r.senal_key as SignalKey} label={r.senal} /> : "—"}</td>
                  <td className="num">{fmtMoney(r.precio)}</td>
                  <td className="num">{fmtBig(r.market_cap)}</td>
                  <td className="num">{isNum(r.fwd_pe) && r.fwd_pe > 0 ? `${r.fwd_pe.toFixed(1)}x` : "—"}</td>
                  <td className="num">{fmtMoney(r.fair_value)}</td>
                  <td className="num" style={{ color: colorMos(r.mos) }}>
                    {fmtPct(r.mos, 0, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
