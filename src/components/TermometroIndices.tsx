"use client";

import { useEffect, useState } from "react";
import { ValoracionSP } from "./ValoracionSP";

const INDICES = [
  { symbol: "^GSPC", nombre: "S&P 500" },
  { symbol: "^NDX", nombre: "Nasdaq-100" },
  { symbol: "^DJI", nombre: "Dow Jones" },
  { symbol: "^RUT", nombre: "Russell 2000" },
];
type Lectura = { nivel: number; zona: { key: string; label: string; accion: string } };
const COLOR: Record<string, string> = { "miedo-extremo": "var(--sig-strong)", miedo: "var(--olive-deep)", neutral: "var(--ink-soft)", codicia: "var(--terracotta-deep)", "codicia-extrema": "var(--sig-avoid)" };

/** Termómetro de miedo/codicia de cada índice (modelo de valoración Invirtiendo); clic = su gráfica completa debajo. */
export function TermometroIndices() {
  const [lect, setLect] = useState<Record<string, Lectura | null>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  useEffect(() => {
    INDICES.forEach((i) =>
      fetch(`/api/valoracion-sp500?symbol=${encodeURIComponent(i.symbol)}`)
        .then((r) => r.json())
        .then((j) => setLect((p) => ({ ...p, [i.symbol]: j.actual ?? null })))
        .catch(() => setLect((p) => ({ ...p, [i.symbol]: null }))),
    );
  }, []);
  const sel = INDICES.find((i) => i.symbol === abierto);
  return (
    <section className="space-y-3">
      <p className="eyebrow">Termómetro del mercado · miedo o codicia</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {INDICES.map((i) => {
          const l = lect[i.symbol];
          return (
            <button key={i.symbol} type="button" aria-pressed={abierto === i.symbol} onClick={() => setAbierto(abierto === i.symbol ? null : i.symbol)} className={`card p-3 text-left hover:border-terracotta transition-colors ${abierto === i.symbol ? "!border-terracotta ring-2 ring-terracotta/40" : ""}`}>
              <p className="text-xs text-ink-soft">{i.nombre}</p>
              {l ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="num font-display text-3xl leading-none" style={{ color: COLOR[l.zona.key] }}>{Math.round(l.nivel)}</span>
                    <span className="text-sm font-bold" style={{ color: COLOR[l.zona.key] }}>{l.zona.label}</span>
                  </div>
                  {/* barra 0-100 con marcador */}
                  <div className="relative mt-2 h-1.5 rounded-full" style={{ background: "linear-gradient(90deg,#6b6e55,#8b8d6f,#d9cbb3,#c46d34,#8c2f1b)" }}>
                    <span className="absolute -top-1 h-3.5 w-1 rounded bg-ink" style={{ left: `calc(${Math.min(100, Math.max(0, l.nivel))}% - 2px)` }} />
                  </div>
                  <p className="text-[0.68rem] text-ink-soft mt-1.5">{l.zona.accion}</p>
                </>
              ) : (
                <span className="skeleton mt-1 block h-10 w-full" />
              )}
            </button>
          );
        })}
      </div>
      {sel && (
        <div className="card p-4">
          <ValoracionSP symbol={sel.symbol} nombre={sel.nombre} embebido />
        </div>
      )}
    </section>
  );
}
