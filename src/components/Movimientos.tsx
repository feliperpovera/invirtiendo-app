"use client";

import Link from "next/link";
import type { MovimientoPublico } from "@/lib/providers/portafolioPublico";
import { ordenar } from "@/lib/orden";
import { fmtMoney, fmtPct } from "@/lib/format";
import { Card, Eyebrow } from "./ui";
import { SelectOrden, useOrden } from "./Orden";
import { TickerLogo } from "./TickerLogo";

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
const cant = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 4 }));
const signo = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : "-"}${fmtMoney(Math.abs(v))}`);
const color = (v: number | null | undefined) => ((v ?? 0) >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)");
const TIPO: Record<MovimientoPublico["tipo"], { txt: string; color: string }> = {
  nueva: { txt: "Nueva posición", color: "var(--sig-strong)" },
  compra: { txt: "Compra", color: "var(--olive-deep)" },
  venta: { txt: "Venta parcial", color: "var(--terracotta-deep)" },
};

const OPC = [["fecha", "Fecha"], ["ticker", "Acción"], ["tipo", "Tipo"], ["cantidad", "Cantidad"], ["precio", "Precio"], ["monto", "Monto"], ["ganancia", "Ganancia"]] as const;
type K = (typeof OPC)[number][0];
const valor = (m: MovimientoPublico, k: K) => (k === "ganancia" ? m.pnl_realizado : k === "tipo" ? TIPO[m.tipo].txt : m[k]);

export function Movimientos({ mov }: { mov: MovimientoPublico[] }) {
  const ctl = useOrden<K>("fecha", true, ["ticker", "tipo"]);
  const vista = ordenar(mov, (m) => valor(m, ctl.o.k), ctl.o.desc);
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <Eyebrow>Movimientos · compras y ventas</Eyebrow>
        <SelectOrden ctl={ctl} opciones={OPC} />
      </div>
      <Card className="p-0 overflow-hidden">
        <ul className="divide-y divide-line">
          {vista.map((m) => (
            <li key={m.ref} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-x-3 items-center px-4 py-2 text-sm">
              <span className="col-span-2 sm:col-span-1 text-xs text-ink-soft num">{fecha(m.fecha)}</span>
              <Link href={`/accion/${m.ticker}`} className="flex items-center gap-2 min-w-0 hover:text-terracotta">
                <TickerLogo symbol={m.ticker} size={22} />
                <span className="flex flex-col sm:flex-row sm:items-center sm:gap-2 min-w-0 leading-tight">
                  <b>{m.ticker}</b>
                  <span className="text-xs font-bold" style={{ color: TIPO[m.tipo].color }}>{m.tipo === "venta" && (m.pct_posicion ?? 0) >= 99.9 ? "Venta total" : TIPO[m.tipo].txt}</span>
                </span>
              </Link>
              <span className="text-xs text-right num leading-tight">
                <span className="whitespace-nowrap">{cant(m.cantidad)} × {fmtMoney(m.precio)} = <b>{fmtMoney(m.monto)}</b></span>
                <span className="block text-ink-soft">
                  {m.tipo === "compra" && m.pct_posicion != null && `+${m.pct_posicion.toFixed(0)}% a la posición`}
                  {m.tipo === "venta" && (
                    <>
                      {m.pct_posicion?.toFixed(0)}% de la posición<span className="hidden sm:inline"> · </span><br className="sm:hidden" />
                      <b style={{ color: color(m.pnl_realizado) }}>
                        {signo(m.pnl_realizado)} ({fmtPct(m.rent_pct, 1, true)})
                      </b>
                    </>
                  )}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
