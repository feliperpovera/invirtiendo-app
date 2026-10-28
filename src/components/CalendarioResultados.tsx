"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TickerLogo } from "./TickerLogo";
import { SignalPill } from "./ui";
import { fmtBig, fmtPct } from "@/lib/format";
import type { SignalKey } from "@/lib/analysis/types";

type Fila = {
  fecha: string; ticker: string; nombre: string; hora: "antes" | "despues" | "nd";
  epsEstimado: number | null; epsReal: number | null; sorpresa: number | null; epsAnioPasado: number | null; trimestre: string | null;
  analistas: number | null; marketCap: number | null; sector: string | null; senal: string | null; senalKey: string | null; mos: number | null; nota: string | null;
};
type Detalle = { sector: string | null; ingresosEstimados: number | null; epsEstimado: number | null; crecIngresosAnio: number | null; crecEpsAnio: number | null; margenOperativo: number | null; clave: string };
type Vista = "dia" | "semana" | "mes" | "anio";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const d0 = (s: string) => new Date(`${s}T12:00:00Z`);
const sumar = (s: string, n: number) => { const d = d0(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const lunes = (s: string) => { const d = d0(s); const k = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - k); return iso(d); };
const hoyNY = () => { const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const HORA = { antes: { i: "☀", t: "Antes de abrir" }, despues: { i: "☾", t: "Después del cierre" }, nd: { i: "•", t: "Hora sin confirmar" } };
const num = (v: number | null, d = 2) => (v == null ? "—" : v.toFixed(d));
const resultadoColor = (f: Fila) => (f.sorpresa == null ? undefined : f.sorpresa >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)");

/** Rango de fechas que pide cada vista. */
function rangos(vista: Vista, ancla: string): Array<[string, string]> {
  const d = d0(ancla);
  if (vista === "dia") return [[ancla, ancla]];
  if (vista === "semana") { const l = lunes(ancla); return [[l, sumar(l, 4)]]; }
  const mes = (y: number, m: number): [string, string] => [iso(new Date(Date.UTC(y, m, 1, 12))), iso(new Date(Date.UTC(y, m + 1, 0, 12)))];
  if (vista === "mes") return [mes(d.getUTCFullYear(), d.getUTCMonth())];
  return Array.from({ length: 12 }, (_, m) => mes(d.getUTCFullYear(), m));
}

/** Calendario de resultados con vistas día, semana, mes y año (estilo TradingView, con nuestras señales). */
export function CalendarioResultados() {
  const [vista, setVista] = useState<Vista>("semana");
  const [ancla, setAncla] = useState(hoyNY());
  const [datos, setDatos] = useState<Record<string, Fila[]>>({}); // clave = "desde|hasta"
  const [cargando, setCargando] = useState(false);
  const [solo, setSolo] = useState(false);
  const [sel, setSel] = useState<Fila | null>(null);

  const rs = useMemo(() => rangos(vista, ancla), [vista, ancla]);
  useEffect(() => {
    const faltan = rs.filter(([a, b]) => !datos[`${a}|${b}`]);
    if (!faltan.length) return;
    setCargando(true);
    Promise.all(faltan.map(([a, b]) => fetch(`/api/calendario?desde=${a}&hasta=${b}`).then((r) => r.json()).then((j) => [`${a}|${b}`, Array.isArray(j) ? j : []] as const).catch(() => [`${a}|${b}`, []] as const)))
      .then((pares) => setDatos((p) => ({ ...p, ...Object.fromEntries(pares) })))
      .finally(() => setCargando(false));
  }, [rs, datos]);

  const filas = rs.flatMap(([a, b]) => datos[`${a}|${b}`] ?? []).filter((f) => !solo || f.senalKey);
  const porDia = useMemo(() => {
    const m = new Map<string, Fila[]>();
    for (const f of filas) m.set(f.fecha, [...(m.get(f.fecha) ?? []), f]);
    return m;
  }, [filas]);

  const mover = (n: number) => {
    const d = d0(ancla);
    if (vista === "dia") { let s = sumar(ancla, n); while (d0(s).getUTCDay() % 6 === 0) s = sumar(s, n); setAncla(s); }
    else if (vista === "semana") setAncla(sumar(ancla, 7 * n));
    else if (vista === "mes") setAncla(iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1, 12))));
    else setAncla(iso(new Date(Date.UTC(d.getUTCFullYear() + n, 0, 1, 12))));
  };
  const ir = (v: Vista, f: string) => { setVista(v); setAncla(f); };
  const titulo = (() => {
    const d = d0(ancla);
    if (vista === "dia") return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    if (vista === "semana") { const l = d0(lunes(ancla)); const v = d0(sumar(lunes(ancla), 4)); return `Semana del ${l.getUTCDate()} ${MESES[l.getUTCMonth()].slice(0, 3)} al ${v.getUTCDate()} ${MESES[v.getUTCMonth()].slice(0, 3)}`; }
    if (vista === "mes") return `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    return String(d.getUTCFullYear());
  })();

  const Chip = ({ f }: { f: Fila }) => (
    <button type="button" onClick={() => setSel(f)} title={`${f.nombre} · ${HORA[f.hora].t}`} className="flex w-full items-center gap-1.5 rounded-lg border border-line bg-paper px-1.5 py-1 text-left text-xs hover:border-terracotta">
      <TickerLogo symbol={f.ticker} size={18} />
      <b className="truncate">{f.ticker}</b>
      <span className="ml-auto text-ink-soft">{HORA[f.hora].i}</span>
      {f.sorpresa != null && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: resultadoColor(f) }} />}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-ink p-1" role="group" aria-label="Vista">
          {([["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"], ["anio", "Año"]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={vista === k} onClick={() => setVista(k)} className={`rounded-full px-4 py-1.5 text-sm font-bold ${vista === k ? "bg-terracotta text-cream" : "text-[#d8cdb9] hover:text-cream"}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => mover(-1)} className="h-9 w-9 rounded-full border border-line hover:border-ink" aria-label="Anterior">‹</button>
          <button type="button" onClick={() => setAncla(hoyNY())} className="h-9 rounded-full border border-line px-3 text-sm font-bold hover:border-ink">Hoy</button>
          <button type="button" onClick={() => mover(1)} className="h-9 w-9 rounded-full border border-line hover:border-ink" aria-label="Siguiente">›</button>
        </div>
        <h2 className="font-display text-2xl first-letter:uppercase">{titulo}</h2>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={solo} onChange={(e) => setSolo(e.target.checked)} className="accent-[var(--terracotta)]" />
          Solo el universo Invirtiendo
        </label>
      </div>
      <p className="text-xs text-ink-soft">
        ☀ antes de abrir · ☾ después del cierre · <span style={{ color: "var(--sig-strong)" }}>●</span> superó el consenso · <span style={{ color: "var(--sig-avoid)" }}>●</span> quedó por debajo · empresas de más de $10B y todo el universo Invirtiendo. {cargando && <b>Cargando…</b>}
      </p>

      {/* Día */}
      {vista === "dia" && (
        <div className="card p-0 overflow-hidden">
          {!filas.length && <p className="p-4 text-sm text-ink-soft">{cargando ? "Cargando…" : "Nadie relevante reporta este día."}</p>}
          <ul className="divide-y divide-line">
            {filas.map((f) => (
              <li key={f.ticker}>
                <button type="button" onClick={() => setSel(f)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.5fr)_8rem_7rem_8rem_7rem] items-center gap-x-3 px-4 py-2.5 text-left text-sm hover:bg-cream-2/50">
                  <span className="flex items-center gap-2 min-w-0">
                    <TickerLogo symbol={f.ticker} size={26} />
                    <b>{f.ticker}</b>
                    <span className="truncate text-xs text-ink-soft">{f.nombre}</span>
                  </span>
                  <span className="text-xs text-ink-soft">{HORA[f.hora].i} {HORA[f.hora].t}</span>
                  <span className="hidden sm:block num text-xs text-right">
                    EPS est. {num(f.epsEstimado)}
                    {f.epsReal != null && <b className="block" style={{ color: resultadoColor(f) }}>real {num(f.epsReal)} ({fmtPct(f.sorpresa, 1, true)})</b>}
                  </span>
                  <span className="hidden sm:flex justify-end">{f.senalKey ? <SignalPill k={f.senalKey as SignalKey} label={f.senal ?? ""} /> : <span className="text-xs text-ink-soft">{fmtBig(f.marketCap)}</span>}</span>
                  <span className="hidden sm:block num text-xs text-right">{f.mos != null ? `${fmtPct(f.mos, 0, true)} margen` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Semana */}
      {vista === "semana" && (
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
          {DIAS.map((n, k) => {
            const f = sumar(lunes(ancla), k);
            const lista = porDia.get(f) ?? [];
            const hoy = f === hoyNY();
            return (
              <div key={f} className={`card p-2 min-h-[12rem] ${hoy ? "!border-terracotta ring-2 ring-terracotta/30" : ""}`}>
                <button type="button" onClick={() => ir("dia", f)} className="mb-2 flex w-full items-baseline justify-between hover:text-terracotta">
                  <span className="text-xs font-bold uppercase tracking-wider">{n} {d0(f).getUTCDate()}</span>
                  <span className="text-[0.65rem] text-ink-soft">{lista.length} empresas</span>
                </button>
                <div className="space-y-1">
                  {lista.slice(0, 14).map((x) => <Chip key={x.ticker} f={x} />)}
                  {lista.length > 14 && <button type="button" onClick={() => ir("dia", f)} className="w-full text-xs underline text-ink-soft">+{lista.length - 14} más</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mes */}
      {vista === "mes" && (() => {
        const d = d0(ancla);
        const primero = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12)));
        const inicio = lunes(primero);
        const semanas = Array.from({ length: 6 }, (_, w) => sumar(inicio, w * 7)).filter((l, w) => w === 0 || d0(l).getUTCMonth() === d.getUTCMonth());
        return (
          <div className="card p-2 overflow-x-auto">
            <div className="grid grid-cols-5 gap-1.5 min-w-[640px]">
              {DIAS.map((n) => <p key={n} className="text-center text-[0.65rem] font-bold uppercase tracking-wider text-ink-soft">{n}</p>)}
              {semanas.flatMap((l) => DIAS.map((_, k) => {
                const f = sumar(l, k);
                const fuera = d0(f).getUTCMonth() !== d.getUTCMonth();
                const lista = porDia.get(f) ?? [];
                return (
                  <button key={f} type="button" disabled={fuera} onClick={() => ir("dia", f)} className={`min-h-[6.5rem] rounded-xl border p-1.5 text-left transition-colors ${fuera ? "opacity-30 border-transparent" : "border-line bg-paper hover:border-terracotta"} ${f === hoyNY() ? "!border-terracotta" : ""}`}>
                    <span className="flex justify-between text-xs"><b>{d0(f).getUTCDate()}</b>{lista.length > 0 && <span className="text-ink-soft">{lista.length}</span>}</span>
                    <span className="mt-1 flex flex-wrap gap-0.5">
                      {lista.slice(0, 8).map((x) => <TickerLogo key={x.ticker} symbol={x.ticker} size={18} />)}
                    </span>
                    {lista[0] && <span className="mt-0.5 block truncate text-[0.62rem] text-ink-soft">{lista.slice(0, 3).map((x) => x.ticker).join(" · ")}</span>}
                  </button>
                );
              }))}
            </div>
          </div>
        );
      })()}

      {/* Año */}
      {vista === "anio" && (() => {
        const y = d0(ancla).getUTCFullYear();
        const conteos = MESES.map((_, m) => filas.filter((f) => d0(f.fecha).getUTCMonth() === m && d0(f.fecha).getUTCFullYear() === y));
        const max = Math.max(1, ...conteos.map((c) => c.length));
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {conteos.map((c, m) => {
              const top = [...c].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0)).slice(0, 6);
              const temporada = [0, 3, 6, 9].includes(m) || [1, 4, 7, 10].includes(m);
              return (
                <button key={m} type="button" onClick={() => ir("mes", iso(new Date(Date.UTC(y, m, 1, 12))))} className="card p-3 text-left hover:border-terracotta">
                  <p className="flex items-baseline justify-between"><b className="capitalize">{MESES[m]}</b><span className="num text-sm">{c.length}</span></p>
                  <div className="mt-2 h-1.5 rounded-full bg-cream-2"><div className="h-full rounded-full" style={{ width: `${(c.length / max) * 100}%`, background: "var(--terracotta)" }} /></div>
                  {temporada && c.length > 0 && <p className="mt-1 text-[0.62rem] font-bold uppercase tracking-wider text-terracotta">Temporada de resultados</p>}
                  <div className="mt-2 flex flex-wrap gap-1">{top.map((x) => <TickerLogo key={x.ticker + x.fecha} symbol={x.ticker} size={20} />)}</div>
                </button>
              );
            })}
          </div>
        );
      })()}
      {vista === "anio" && <p className="text-xs text-ink-soft">Las fechas se confirman unas semanas antes de cada reporte: los meses lejanos se van llenando a medida que las empresas anuncian su fecha.</p>}

      {sel && <DetalleEmpresa f={sel} cerrar={() => setSel(null)} />}
    </div>
  );
}

/** Panel con lo que importa del reporte: EPS, ingresos, crecimiento, el indicador clave del sector y nuestra señal. */
function DetalleEmpresa({ f, cerrar }: { f: Fila; cerrar: () => void }) {
  const [d, setD] = useState<Detalle | null>(null);
  useEffect(() => {
    setD(null);
    fetch(`/api/earnings-detalle?symbol=${encodeURIComponent(f.ticker)}`).then((r) => r.json()).then((j) => !j.error && setD(j)).catch(() => {});
  }, [f.ticker]);
  const crecEps = f.epsEstimado != null && f.epsAnioPasado ? ((f.epsEstimado / f.epsAnioPasado - 1) * 100) : null;
  const dato = (k: string, v: React.ReactNode, sub?: React.ReactNode) => (
    <div className="rounded-xl bg-cream-2/60 p-3">
      <p className="text-[0.62rem] uppercase tracking-wider font-bold text-ink-soft">{k}</p>
      <p className="num font-display text-xl leading-tight mt-0.5">{v}</p>
      {sub && <p className="text-[0.7rem] text-ink-soft mt-0.5">{sub}</p>}
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-3" onClick={cerrar}>
      <div className="card w-full max-w-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Resultados de ${f.ticker}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <TickerLogo symbol={f.ticker} size={44} />
            <div>
              <p className="font-display text-2xl leading-none">{f.ticker}</p>
              <p className="text-xs text-ink-soft">{f.nombre}</p>
              <p className="text-xs mt-1">{d0(f.fecha).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} · {HORA[f.hora].i} {HORA[f.hora].t}{f.trimestre ? ` · trimestre ${f.trimestre}` : ""}</p>
            </div>
          </div>
          <button type="button" onClick={cerrar} className="h-8 w-8 rounded-full border border-line" aria-label="Cerrar">✕</button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {f.epsReal != null
            ? dato("EPS real", <span style={{ color: resultadoColor(f) }}>{num(f.epsReal)}</span>, `vs ${num(f.epsEstimado)} esperado · ${fmtPct(f.sorpresa, 1, true)}`)
            : dato("EPS esperado", num(f.epsEstimado), `${f.analistas ?? "—"} analistas · hace un año ${num(f.epsAnioPasado)}${crecEps != null ? ` (${fmtPct(crecEps, 0, true)})` : ""}`)}
          {dato("Ingresos esperados (Revenue)", d ? fmtBig(d.ingresosEstimados) : "…", d?.crecIngresosAnio != null ? `crecimiento del año ${fmtPct(d.crecIngresosAnio, 1, true)}` : undefined)}
          {dato("Crecimiento de EPS del año", d ? fmtPct(d.crecEpsAnio, 1, true) : "…", "consenso de analistas")}
          {dato("Margen operativo", d ? fmtPct(d.margenOperativo, 1) : "…", "últimos 12 meses")}
        </div>
        <div className="rounded-xl border border-terracotta/40 bg-terracotta-tint/40 p-3">
          <p className="text-[0.62rem] uppercase tracking-wider font-bold text-terracotta">Lo que mira el mercado{d?.sector ? ` · ${d.sector}` : ""}</p>
          <p className="text-sm mt-1">{d ? d.clave : "…"}</p>
        </div>
        {f.senalKey && (
          <div className="flex items-center gap-3 text-sm">
            <SignalPill k={f.senalKey as SignalKey} label={f.senal ?? ""} />
            <span>Margen de seguridad <b className="num">{fmtPct(f.mos, 0, true)}</b>{f.nota ? ` · nota ${f.nota}` : ""}</span>
          </div>
        )}
        <Link href={`/accion/${f.ticker}`} className="btn btn-primary w-full justify-center">Ver análisis completo de {f.ticker}</Link>
      </div>
    </div>
  );
}
