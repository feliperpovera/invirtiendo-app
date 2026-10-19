"use client";

import { useEffect, useState } from "react";
import type { Rendimiento } from "@/app/api/rendimientos/route";
import { fmtMoney, fmtPct } from "@/lib/format";

const P: Array<[keyof Rendimiento, string]> = [["hoy", "1D"], ["s1", "5D"], ["m1", "1M"], ["m3", "3M"], ["m6", "6M"], ["ytd", "YTD"], ["a1", "1A"]];

/** Franja de rendimientos por periodo (como la de TradingView bajo el precio), refrescada cada minuto. */
export function FranjaRendimiento({ symbol }: { symbol: string }) {
  const [r, setR] = useState<Rendimiento | null>(null);
  useEffect(() => {
    let vivo = true;
    const cargar = () => fetch(`/api/rendimientos?symbols=${encodeURIComponent(symbol)}`).then((x) => x.json()).then((j) => vivo && setR(j[symbol] ?? null)).catch(() => {});
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [symbol]);
  if (!r) return <div className="skeleton h-14 w-full max-w-2xl" />;
  return (
    <div className="flex flex-wrap items-stretch gap-1.5">
      <div className="flex flex-col justify-center rounded-xl border border-line bg-paper px-3 py-1.5">
        <span className="text-[0.6rem] uppercase tracking-wider text-ink-soft font-bold flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-terracotta motion-safe:animate-pulse" /> En vivo
        </span>
        <span className="num font-bold text-sm">{fmtMoney(r.precio)}</span>
      </div>
      {P.map(([k, l]) => {
        const v = r[k] as number | null;
        return (
          <div key={k} className="flex min-w-[3.6rem] flex-col justify-center rounded-xl px-2.5 py-1.5" style={{ background: v == null ? "var(--cream-2)" : v >= 0 ? "var(--olive-tint)" : "var(--terracotta-tint)" }}>
            <span className="text-[0.6rem] uppercase tracking-wider text-ink-soft font-bold">{l}</span>
            <span className="num font-bold text-sm" style={{ color: v == null ? undefined : v >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>{fmtPct(v, 2, true)}</span>
          </div>
        );
      })}
    </div>
  );
}
