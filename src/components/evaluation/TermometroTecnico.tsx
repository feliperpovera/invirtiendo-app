"use client";

import { useMemo } from "react";
import type { PricePoint } from "@/lib/analysis/types";
import { termometro, ZONAS, PATRONES } from "@/lib/tecnico";
import { Card, Eyebrow } from "@/components/ui";

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const COLOR = { alcista: "var(--sig-strong)", bajista: "var(--sig-avoid)", neutral: "var(--ink-soft)" };

/** Termómetro técnico: ¿es buen momento para comprar? Complementa (no reemplaza) los filtros y el margen de seguridad. */
export function TermometroTecnico({ daily }: { daily: PricePoint[] }) {
  const tm = useMemo(() => (daily.length > 60 ? termometro(daily) : null), [daily]);
  if (!tm) return null;
  const { score, zona, componentes, patrones } = tm;
  const desde = daily.length - 40;
  const recientes = patrones.filter((p) => p.i >= desde).slice(-6).reverse();

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow>Termómetro técnico · momento de compra</Eyebrow>
        <span className="text-xs text-ink-soft">Lo técnico decide cuándo; los filtros, qué.</span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-1">
        <span className="num text-5xl font-bold leading-none" style={{ color: zona.color }}>{score ?? "—"}</span>
        <span className="pb-1">
          <b className="block" style={{ color: zona.color }}>{score == null ? "Sin datos suficientes" : zona.nombre}</b>
          <span className="text-sm text-ink-soft">{score != null && zona.accion}</span>
        </span>
      </div>

      {/* Escala 0–100 con las cuatro zonas */}
      <div className="relative mt-4 mb-6">
        <div className="flex h-3 overflow-hidden rounded-full">
          {[...ZONAS].reverse().map((z, i, a) => (
            <span key={z.nombre} style={{ background: z.color, width: `${(a[i + 1]?.min ?? 100) - z.min}%`, opacity: 0.85 }} />
          ))}
        </div>
        {score != null && <span className="absolute -top-1 h-5 w-1.5 -translate-x-1/2 rounded-full bg-ink ring-2 ring-paper" style={{ left: `${score}%` }} />}
        <div className="absolute inset-x-0 top-4 text-[0.6rem] text-ink-soft">
          {[...ZONAS].reverse().map((z) => (
            <span key={z.nombre} className="absolute hidden sm:inline" style={{ left: `${z.min}%` }}>{z.nombre}</span>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-line-soft">
        {componentes.map((c) => (
          <li key={c.clave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 sm:grid-cols-[13rem_6rem_minmax(0,1fr)_auto]">
            <span className="text-sm font-bold">
              {c.nombre} <span className="font-normal text-ink-soft text-xs">· {c.peso}%</span>
            </span>
            <span className="h-1.5 rounded-full bg-cream-2 overflow-hidden sm:order-none order-last col-span-2 sm:col-span-1">
              {c.score != null && <span className="block h-full rounded-full" style={{ width: `${Math.max(4, c.score * 100)}%`, background: c.score >= 0.65 ? "var(--sig-strong)" : c.score >= 0.4 ? "var(--sig-watch)" : "var(--sig-avoid)" }} />}
            </span>
            <span className="hidden sm:block text-xs text-ink-soft">{c.lectura}</span>
            <span className="num text-sm font-bold text-right">{c.valor}</span>
            <span className="sm:hidden col-span-2 text-xs text-ink-soft">{c.lectura}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-line pt-3">
        <p className="text-sm font-bold">Análisis de velas · últimas 8 semanas</p>
        {recientes.length ? (
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {recientes.map((p) => {
              const d = new Date(p.t);
              return (
                <li key={p.i} className="rounded-xl border border-line p-2 text-xs">
                  <span className="flex items-center justify-between gap-2">
                    <b style={{ color: COLOR[p.tipo] }}>{p.tipo === "alcista" ? "▲" : p.tipo === "bajista" ? "▼" : "◆"} {p.nombre}</b>
                    <span className="text-ink-soft">{d.getDate()} {MES[d.getMonth()]}{p.volumen ? " · con volumen alto" : ""}</span>
                  </span>
                  <span className="mt-0.5 block text-ink-soft">{PATRONES[p.nombre]}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-ink-soft">Sin patrones relevantes en las últimas 8 semanas.</p>
        )}
        <p className="mt-2 text-[0.7rem] text-ink-soft">
          Las velas solas tienen evidencia débil (pesan 5%): valen más cuando confirman la tendencia, aparecen junto a la SMA 200 o el máximo de 52 semanas y vienen con volumen alto. Momentum, máximo 52 semanas y SMA 200 son los de mayor respaldo académico. Educativo, no asesoría.
        </p>
      </div>
    </Card>
  );
}
