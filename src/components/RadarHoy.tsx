"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { RankingRow } from "@/lib/providers/ranking";
import { TickerLogo } from "./TickerLogo";
import { ValoracionSP } from "./ValoracionSP";
import { EVENTO_INDICE, type IndiceElegido } from "./PortafolioVsSP";
import { fmtMoney, fmtPct } from "@/lib/format";

type Lectura = { nivel: number; zona: { key: string; label: string; accion: string } };
const COLOR: Record<string, string> = { "miedo-extremo": "var(--sig-strong)", miedo: "var(--olive-deep)", neutral: "var(--ink-soft)", codicia: "var(--terracotta-deep)", "codicia-extrema": "var(--sig-avoid)" };

/**
 * Portada: "Radar de oportunidades hoy". Arriba el termómetro del índice elegido (las tarjetas de índices del mundo
 * lo cambian sin salir de la página); abajo las 5 mejores Strong Buy del día, de calidad A/B, por margen de seguridad.
 */
export function RadarHoy({ top }: { top: RankingRow[] }) {
  const [idx, setIdx] = useState<IndiceElegido>({ symbol: "^GSPC", nombre: "S&P 500" });
  const [lect, setLect] = useState<Lectura | null>(null);
  const [verGrafica, setVerGrafica] = useState(false);
  useEffect(() => {
    const cambiar = (e: Event) => setIdx((e as CustomEvent<IndiceElegido>).detail);
    window.addEventListener(EVENTO_INDICE, cambiar);
    return () => window.removeEventListener(EVENTO_INDICE, cambiar);
  }, []);
  useEffect(() => {
    setLect(null);
    fetch(`/api/valoracion-sp500?symbol=${encodeURIComponent(idx.symbol)}`).then((r) => r.json()).then((j) => setLect(j.actual ?? null)).catch(() => {});
  }, [idx.symbol]);

  return (
    <section id="grafica-inicio" className="card p-5 sm:p-6 scroll-mt-24 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Radar de oportunidades · hoy</p>
          <h2 className="font-display text-3xl sm:text-4xl leading-none mt-1">¿Dónde está la oportunidad?</h2>
        </div>
        <Link href="/ranking" className="text-sm underline text-ink-soft hover:text-terracotta">Ver el ranking completo</Link>
      </div>

      {/* Termómetro del mercado */}
      <div className="rounded-2xl bg-ink text-cream p-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-[9rem]">
          <p className="text-[0.65rem] uppercase tracking-wider text-[#a9a296] font-bold">Termómetro · {idx.nombre}</p>
          {lect ? (
            <p className="flex items-baseline gap-2 mt-0.5">
              <span className="num font-display text-4xl leading-none">{Math.round(lect.nivel)}</span>
              <span className="font-bold text-lg" style={{ color: lect.nivel < 45 ? "#9fb37a" : lect.nivel < 55 ? "#d9cbb3" : "#e08a6a" }}>{lect.zona.label}</span>
            </p>
          ) : (
            <span className="skeleton block h-9 w-32 mt-1" />
          )}
        </div>
        <div className="flex-1 min-w-[12rem]">
          <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg,#6b6e55,#8b8d6f,#d9cbb3,#c46d34,#8c2f1b)" }}>
            {lect && <span className="absolute -top-1.5 h-5 w-1.5 rounded bg-cream shadow" style={{ left: `calc(${Math.min(100, Math.max(0, lect.nivel))}% - 3px)` }} />}
          </div>
          <div className="flex justify-between text-[0.6rem] text-[#a9a296] mt-1">
            <span>Miedo extremo</span>
            <span>Neutral</span>
            <span>Codicia extrema</span>
          </div>
        </div>
        <div className="text-sm">
          {lect && <p className="font-bold">{lect.zona.accion}</p>}
          <button type="button" onClick={() => setVerGrafica((v) => !v)} className="text-xs underline text-[#d8cdb9] hover:text-cream">
            {verGrafica ? "Ocultar gráfica" : "Ver la gráfica de zonas de compra"}
          </button>
        </div>
      </div>
      {verGrafica && <ValoracionSP symbol={idx.symbol} nombre={idx.nombre} embebido />}

      {/* Las 5 mejores oportunidades del día */}
      <div>
        <p className="text-xs text-ink-soft mb-2">Strong Buy de calidad (nota A o B), ordenadas por margen de seguridad frente al Fair Value. Se recalcula cada día.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {top.map((r, i) => (
            <Link key={r.ticker} href={`/accion/${r.ticker}`} className="group card p-4 hover:border-terracotta hover:-translate-y-0.5 transition-all">
              <div className="flex items-center justify-between">
                <span className="font-display text-2xl text-terracotta leading-none">{i + 1}</span>
                <span className="pill text-[0.65rem]" style={{ background: "var(--sig-strong)", color: "var(--cream)" }}>Strong Buy</span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <TickerLogo symbol={r.ticker} size={32} />
                <div className="min-w-0">
                  <p className="font-bold leading-tight">{r.ticker}</p>
                  <p className="text-[0.68rem] text-ink-soft truncate">{r.nombre ?? ""}</p>
                </div>
              </div>
              <p className="num font-display text-3xl leading-none mt-3" style={{ color: "var(--sig-strong)" }}>{fmtPct(r.mos, 0, true)}</p>
              <p className="text-[0.68rem] text-ink-soft">margen de seguridad</p>
              <p className="text-xs num mt-2">
                {fmtMoney(r.precio)} → FV <b>{fmtMoney(r.fair_value)}</b>
              </p>
              <p className="text-xs mt-1">
                Nota <b>{r.grade}</b> · score {r.score}
              </p>
              <p className="text-xs font-bold text-terracotta mt-2 group-hover:underline">Ver análisis →</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
