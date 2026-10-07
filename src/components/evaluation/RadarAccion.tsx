"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PricePoint } from "@/lib/analysis/types";
import type { Movimiento, Posicion } from "@/lib/providers/radar";
import { QUIEN } from "@/lib/radarPersonas";
import { Card, Eyebrow } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";

type Fila = { persona: string; periodo: string; trece: boolean; posicion: Posicion | null; compra: Movimiento | null; venta: Movimiento | null };
const DIA = 864e5;

/**
 * Radar del Poder en la ficha: quién de los políticos y fondos tiene, compró o vendió esta acción y a qué precio aprox.
 * Pelosi y Trump reportan la fecha de cada operación: se toma el cierre de ese día. Los 13F solo dicen la cifra al cierre
 * del trimestre: se usa el precio promedio de ese trimestre como estimación del precio de compra.
 */
export function RadarAccion({ symbol, daily, price }: { symbol: string; daily: PricePoint[]; price: number }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  useEffect(() => {
    fetch(`/api/radar/${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then(setFilas)
      .catch(() => setFilas([]));
  }, [symbol]);
  if (!filas?.length) return null;

  const cierre = (iso: string) => {
    const t = Date.parse(iso) + DIA;
    let c: number | null = null;
    for (const p of daily) if (p.t <= t) c = p.c;
    return c;
  };
  const promedio = (iso: string) => {
    const fin = Date.parse(iso) + DIA;
    const v = daily.filter((p) => p.t > fin - 92 * DIA && p.t <= fin).map((p) => p.c);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const precioDe = (m: Movimiento, trece: boolean) => {
    const ps = (trece ? [promedio(m.ultima)] : (m.fechas ?? [m.ultima]).map(cierre)).filter((x): x is number => x != null);
    return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
  };
  const Op = ({ m, tipo, trece }: { m: Movimiento; tipo: "Compró" | "Vendió"; trece: boolean }) => {
    const p = precioDe(m, trece);
    const desde = p ? ((price - p) / p) * 100 : null;
    return (
      <p className="text-xs">
        <b style={{ color: tipo === "Compró" ? "var(--sig-strong)" : "var(--terracotta-deep)" }}>{tipo}</b>
        {trece ? " en el trimestre al " + m.ultima : ` ${m.veces > 1 ? `${m.veces} veces` : ""} · ${(m.fechas ?? [m.ultima]).slice(-3).join(", ")}`}
        {p && (
          <>
            {" "}· precio aprox. <b className="num">{fmtMoney(p)}</b>
            {trece && <span className="text-ink-soft"> (promedio del trimestre)</span>}
            {desde != null && (
              <span className="num" style={{ color: desde >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}> · {fmtPct(desde, 1, true)} desde entonces</span>
            )}
          </>
        )}
        {m.montoMax ? <span className="text-ink-soft"> · ≈ {fmtMoney(m.montoMin ?? 0, 0)} – {fmtMoney(m.montoMax, 0)}</span> : null}
      </p>
    );
  };

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <Eyebrow>Radar del Poder · {filas.length} de 10 la mueven</Eyebrow>
        <Link href="/radar" className="text-xs underline text-ink-soft">Ver radar</Link>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {filas.map((f) => (
          <li key={f.persona} className="py-2 space-y-0.5">
            <p className="text-sm">
              <b>{QUIEN[f.persona]?.nombre ?? f.persona}</b> <span className="text-xs text-ink-soft">{QUIEN[f.persona]?.rol}</span>
              {f.posicion && <span className="pill ml-2 text-[0.65rem] bg-olive-tint text-olive-deep">{f.posicion.peso.toFixed(1)}% del portafolio · {f.posicion.cambio}</span>}
            </p>
            {f.compra && <Op m={f.compra} tipo="Compró" trece={f.trece} />}
            {f.venta && <Op m={f.venta} tipo="Vendió" trece={f.trece} />}
          </li>
        ))}
      </ul>
      <p className="text-[0.65rem] text-ink-soft mt-2">Precio aprox. = cierre del día de cada operación reportada (Pelosi, Trump) o promedio del trimestre (13F de los fondos). Los reportes llegan hasta 45 días tarde.</p>
    </Card>
  );
}
