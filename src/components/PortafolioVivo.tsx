"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PosicionPublica } from "@/lib/providers/portafolioPublico";
import type { Rendimiento } from "@/app/api/rendimientos/route";
import { Card, Eyebrow, SignalPill } from "./ui";
import { TickerLogo } from "./TickerLogo";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { SignalKey } from "@/lib/analysis/types";

const PERIODOS = [
  ["1D", "Hoy"],
  ["1S", "1 semana"],
  ["1M", "1 mes"],
  ["3M", "3 meses"],
  ["6M", "6 meses"],
  ["YTD", "En el año"],
] as const;
const tono = (v: number | null | undefined) => ((v ?? 0) >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)");
const signo = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : "-"}${fmtMoney(Math.abs(v))}`);
const cant = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 4 }));
type Ret = { portafolio: number; indiceComun: number };

/** Cada minuto: el endpoint de rendimientos usa caché de 1-2 min, así que es "en vivo" con hasta 15 min de retraso de la fuente. */
function useCadaMinuto<T>(url: string | null, inicial: T): T {
  const [d, setD] = useState<T>(inicial);
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    const cargar = () => fetch(url).then((r) => r.json()).then((j) => vivo && setD(j)).catch(() => {});
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [url]);
  return d;
}

/** Franja de rendimiento de la cuenta por periodo (TWR de IBKR + hoy estimado en vivo) frente al S&P 500. */
export function RendimientoCuenta() {
  const [ret, setRet] = useState<Record<string, Ret | null>>({});
  useEffect(() => {
    let vivo = true;
    const cargar = (r: string) =>
      fetch(`/api/portafolio?rango=${r}`)
        .then((x) => x.json())
        .then((j) => vivo && setRet((p) => ({ ...p, [r]: j.retorno ?? null })))
        .catch(() => {});
    PERIODOS.forEach(([r]) => cargar(r));
    const t = setInterval(() => PERIODOS.forEach(([r]) => cargar(r)), 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);
  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
      {PERIODOS.map(([r, l]) => {
        const v = ret[r];
        const dif = v ? v.portafolio - v.indiceComun : null;
        return (
          <Card key={r} className="p-3">
            <p className="text-[0.62rem] uppercase tracking-wider text-ink-soft font-bold flex items-center gap-1.5">
              {r === "1D" && <span className="inline-block h-1.5 w-1.5 rounded-full bg-terracotta motion-safe:animate-pulse" />}
              {l}
            </p>
            {v ? (
              <>
                <p className="num font-display text-2xl leading-tight" style={{ color: tono(v.portafolio) }}>{fmtPct(v.portafolio, 2, true)}</p>
                <p className="num text-[0.68rem] text-ink-soft">
                  S&amp;P {fmtPct(v.indiceComun, 2, true)} · <b style={{ color: tono(dif) }}>{dif! >= 0 ? "+" : ""}{dif!.toFixed(2)} pp</b>
                </p>
              </>
            ) : (
              <span className="skeleton block h-8 w-20 mt-1" />
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** Posiciones con precio, ganancia del día y rendimiento por periodo, refrescados cada minuto. */
export function PosicionesVivo({ pos, senales }: { pos: PosicionPublica[]; senales: Record<string, { key: string; label: string } | undefined> }) {
  const rend = useCadaMinuto<Record<string, Rendimiento | null>>(pos.length ? `/api/rendimientos?symbols=${pos.map((p) => p.ticker).join(",")}` : null, {});
  const filas = pos.map((p) => {
    const r = rend[p.ticker];
    const precio = r?.precio ?? p.precio ?? 0;
    const valor = (p.cantidad ?? 0) * precio;
    const ant = r?.hoy != null ? precio / (1 + r.hoy / 100) : null;
    return { p, r, precio, valor, pnl: valor - (p.cantidad ?? 0) * (p.precio_prom ?? 0), pnlDia: ant != null ? (precio - ant) * (p.cantidad ?? 0) : p.pnl_dia };
  });
  const total = filas.reduce((a, f) => a + f.valor, 0);
  const dia = filas.reduce((a, f) => a + (f.pnlDia ?? 0), 0);
  const pnl = filas.reduce((a, f) => a + f.pnl, 0);
  const COLS = "grid-cols-[minmax(0,1fr)_5rem_5.5rem] lg:grid-cols-[minmax(0,1.2fr)_5rem_5.5rem_6rem_4.2rem_4.2rem_4.2rem_6.5rem_6rem]";
  const pct = (v: number | null | undefined) => <span className="num text-right text-xs font-semibold" style={{ color: tono(v) }}>{fmtPct(v, 1, true)}</span>;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <Eyebrow>Posiciones · en vivo</Eyebrow>
        <p className="text-xs text-ink-soft num">
          Valor <b className="text-ink">{fmtMoney(total)}</b> · hoy <b style={{ color: tono(dia) }}>{signo(dia)}</b> · ganancia <b style={{ color: tono(pnl) }}>{signo(pnl)}</b>
        </p>
      </div>
      <Card className="p-0 overflow-hidden">
        <div className={`grid ${COLS} gap-x-3 px-4 py-2 text-[0.6rem] uppercase tracking-wider text-ink-soft border-b border-line`}>
          <span>Acción</span>
          <span className="text-right">Precio</span>
          <span className="text-right">Hoy</span>
          <span className="hidden lg:block text-right">Valor</span>
          <span className="hidden lg:block text-right">1 sem</span>
          <span className="hidden lg:block text-right">1 mes</span>
          <span className="hidden lg:block text-right">6 meses</span>
          <span className="hidden lg:block text-right">Ganancia</span>
          <span className="hidden lg:block text-right">Señal</span>
        </div>
        <ul className="divide-y divide-line">
          {filas.map(({ p, r, precio, valor, pnl, pnlDia }) => {
            const s = senales[p.ticker];
            return (
              <li key={p.ticker} className={`grid ${COLS} gap-x-3 items-center px-4 py-2 text-sm`}>
                <Link href={`/accion/${p.ticker}`} className="flex items-center gap-2 min-w-0 hover:text-terracotta">
                  <TickerLogo symbol={p.ticker} size={26} />
                  <span className="min-w-0">
                    <b>{p.ticker}</b> <span className="num text-xs text-ink-soft">{total ? ((valor / total) * 100).toFixed(1) : p.peso.toFixed(1)}%</span>
                    <span className="block text-[0.65rem] text-ink-soft num">{cant(p.cantidad)} × {fmtMoney(p.precio_prom)} prom.</span>
                  </span>
                </Link>
                <span className="num text-right">{fmtMoney(precio)}</span>
                <span className="num text-right font-bold leading-tight" style={{ color: tono(r?.hoy) }}>
                  {fmtPct(r?.hoy ?? null, 2, true)}
                  <span className="block text-[0.68rem] font-normal">{signo(pnlDia)}</span>
                </span>
                <span className="hidden lg:block num text-right font-bold">{fmtMoney(valor)}</span>
                <span className="hidden lg:block text-right">{pct(r?.s1)}</span>
                <span className="hidden lg:block text-right">{pct(r?.m1)}</span>
                <span className="hidden lg:block text-right">{pct(r?.m6)}</span>
                <span className="hidden lg:block num text-right font-bold leading-tight" style={{ color: tono(pnl) }}>
                  {signo(pnl)}
                  <span className="block text-[0.68rem]">{fmtPct(p.precio_prom ? (precio / p.precio_prom - 1) * 100 : null, 1, true)}</span>
                </span>
                <span className="hidden lg:flex justify-end">{s ? <SignalPill k={s.key as SignalKey} label={s.label} /> : <span className="text-xs text-ink-soft">ETF</span>}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}
