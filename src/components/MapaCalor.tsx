"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { RankingRow } from "@/lib/providers/ranking";
import { squarify } from "@/lib/treemap";
import { fmtBig, fmtMoney, fmtPct } from "@/lib/format";

type Modo = "mos" | "dia";
const ES: Record<string, string> = { Technology: "Tecnología", "Communication Services": "Comunicaciones", "Consumer Cyclical": "Consumo cíclico", "Consumer Defensive": "Consumo básico", Healthcare: "Salud", "Financial Services": "Financiero", Industrials: "Industria", Energy: "Energía", Utilities: "Servicios públicos", "Basic Materials": "Materiales", "Real Estate": "Inmobiliario" };

/** Escala divergente de marca: ladrillo (malo) → beige (neutro) → oliva (bueno). */
function color(v: number | null, tope: number) {
  if (v == null) return "#c9c1b0";
  const t = Math.max(-1, Math.min(1, v / tope));
  const mezcla = (a: number[], b: number[], k: number) => `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(",")})`;
  return t >= 0 ? mezcla([214, 205, 186], [74, 98, 58], t) : mezcla([214, 205, 186], [140, 47, 27], -t);
}

/**
 * Mapa de calor al estilo TradingView, con nuestros cálculos: área = capitalización, agrupado por sector,
 * color = margen de seguridad Invirtiendo (o el cambio del día, con precios en vivo).
 */
export function MapaCalor({ filas }: { filas: RankingRow[] }) {
  const [modo, setModo] = useState<Modo>("mos");
  const [dia, setDia] = useState<Record<string, number | null>>({});
  const [ancho, setAncho] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (modo !== "dia" || Object.keys(dia).length) return;
    const t = filas.map((f) => f.ticker);
    const lotes = Array.from({ length: Math.ceil(t.length / 40) }, (_, i) => t.slice(i * 40, i * 40 + 40));
    Promise.all(lotes.map((l) => fetch(`/api/quote?symbols=${l.join(",")}`).then((r) => r.json()).catch(() => ({ quotes: {} }))))
      .then((rs) => setDia(Object.fromEntries(rs.flatMap((r) => Object.entries(r.quotes ?? {}).map(([k, q]) => [k, (q as { changePct?: number } | null)?.changePct ?? null])))));
  }, [modo, dia, filas]);

  const alto = ancho < 640 ? 900 : 620;
  const celdas = useMemo(() => {
    if (!ancho) return [];
    // Una sola clase por empresa: GOOG duplicaría a Alphabet (misma capitalización)
    const hay = new Set(filas.map((f) => f.ticker));
    const val = filas.filter((f) => (f.market_cap ?? 0) > 0 && !(f.ticker === "GOOG" && hay.has("GOOGL")));
    const porSector = new Map<string, RankingRow[]>();
    for (const f of val) porSector.set(f.sector ?? "Otros", [...(porSector.get(f.sector ?? "Otros") ?? []), f]);
    const sectores = squarify([...porSector].map(([s, fs]) => ({ v: fs.reduce((a, f) => a + (f.market_cap ?? 0), 0), d: s })), { x: 0, y: 0, w: ancho, h: alto });
    return sectores.map((s) => ({
      ...s,
      hijos: squarify(porSector.get(s.d)!.map((f) => ({ v: f.market_cap!, d: f })), { x: s.x + 1, y: s.y + 16, w: Math.max(0, s.w - 2), h: Math.max(0, s.h - 17) }),
    }));
  }, [filas, ancho, alto]);
  const valor = (f: RankingRow) => (modo === "mos" ? f.mos : dia[f.ticker] ?? null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(
          [
            ["mos", "Margen de seguridad"],
            ["dia", "Cambio del día"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={modo === k} onClick={() => setModo(k)} className={`pill border ${modo === k ? "bg-ink text-cream border-ink" : "border-line text-ink-soft"}`}>
            {l}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-ink-soft">
          {modo === "mos" ? "−40%" : "−3%"}
          <span className="h-2.5 w-36 rounded-full" style={{ background: `linear-gradient(90deg, ${color(-1, 1)}, ${color(0, 1)}, ${color(1, 1)})` }} />
          {modo === "mos" ? "+40%" : "+3%"}
        </span>
      </div>
      <div ref={caja} className="relative w-full overflow-hidden rounded-2xl bg-ink" style={{ height: alto }}>
        {celdas.map((s) => (
          <div key={s.d}>
            <span className="absolute text-[0.62rem] font-bold uppercase tracking-wider text-[#d8cdb9] truncate px-1" style={{ left: s.x, top: s.y + 1, width: s.w }}>
              {ES[s.d] ?? s.d}
            </span>
            {s.hijos.map((c) => {
              const f = c.d;
              const v = valor(f);
              const grande = c.w > 70 && c.h > 46;
              const visible = c.w > 34 && c.h > 22;
              return (
                <Link
                  key={f.ticker}
                  href={`/accion/${f.ticker}`}
                  title={`${f.ticker} · ${f.nombre ?? ""}\nMargen de seguridad ${fmtPct(f.mos, 0, true)} · ${f.senal ?? ""}\nPrecio ${fmtMoney(f.precio)} · Fair Value ${fmtMoney(f.fair_value)} · Cap. ${fmtBig(f.market_cap)}${dia[f.ticker] != null ? `\nHoy ${fmtPct(dia[f.ticker], 2, true)}` : ""}`}
                  className="absolute flex flex-col items-center justify-center overflow-hidden border border-ink text-center leading-tight hover:brightness-110 hover:z-10 transition-[filter]"
                  style={{ left: c.x, top: c.y, width: c.w, height: c.h, background: color(v, modo === "mos" ? 40 : 3), color: Math.abs(v ?? 0) > (modo === "mos" ? 18 : 1.4) ? "#f5ead8" : "#22211d" }}
                >
                  {visible && <b style={{ fontSize: Math.max(9, Math.min(22, c.w / 5)) }}>{f.ticker}</b>}
                  {grande && <span className="num text-[0.7rem]">{fmtPct(v, modo === "mos" ? 0 : 2, true)}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-ink-soft">
        Tamaño = capitalización de mercado. {modo === "mos" ? "Color = margen de seguridad frente al Fair Value de Invirtiendo (se recalcula cada día)." : "Color = cambio del día con precios en vivo (hasta 15 min de retraso)."} Pasa el cursor para ver el detalle; clic para la ficha.
      </p>
    </div>
  );
}
