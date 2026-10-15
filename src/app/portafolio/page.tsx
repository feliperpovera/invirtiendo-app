import type { Metadata } from "next";
import Link from "next/link";
import { leerPosiciones, leerMovimientos, type MovimientoPublico } from "@/lib/providers/portafolioPublico";
import { leerRanking } from "@/lib/providers/ranking";
import { PortafolioVsSP } from "@/components/PortafolioVsSP";
import { TickerLogo } from "@/components/TickerLogo";
import { Card, Eyebrow, SignalPill } from "@/components/ui";
import { fmtPct } from "@/lib/format";
import type { SignalKey } from "@/lib/analysis/types";

export const metadata: Metadata = { title: "Portafolio Invirtiendoo" };
export const dynamic = "force-dynamic";

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
const TIPO: Record<MovimientoPublico["tipo"], { txt: string; color: string }> = {
  nueva: { txt: "Nueva posición", color: "var(--sig-strong)" },
  compra: { txt: "Aumentó", color: "var(--olive-deep)" },
  venta: { txt: "Venta parcial", color: "var(--terracotta-deep)" },
};

export default async function PortafolioPage() {
  const [pos, mov, rk] = await Promise.all([leerPosiciones(), leerMovimientos(), leerRanking(200)]);
  const senal = new Map(rk.map((r) => [r.ticker, r]));
  const act = pos[0]?.actualizado;
  const max = Math.max(...pos.map((p) => p.peso), 1);

  return (
    <div className="pt-10 space-y-6">
      <div>
        <Eyebrow>Portafolio Invirtiendoo</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">Nuestra cuenta real, a la vista.</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm">
          Lo que tenemos, lo que compramos y lo que vendimos en Interactive Brokers. Solo porcentajes: el peso de cada acción, su rentabilidad y qué parte de la posición se movió. Se actualiza solo cada día hábil.
        </p>
      </div>

      <PortafolioVsSP />

      <section>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <Eyebrow>Posiciones · {pos.length}</Eyebrow>
          {act && <p className="text-xs text-ink-soft">Actualizado {new Date(act).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" })}</p>}
        </div>
        <Card className="p-0 overflow-hidden">
          <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5rem_6.5rem_6rem] gap-x-3 px-4 py-2 text-[0.62rem] uppercase tracking-wider text-ink-soft border-b border-line">
            <span>Acción</span>
            <span className="hidden sm:block">Peso</span>
            <span className="text-right">Rentab.</span>
            <span className="hidden sm:block text-right">Señal hoy</span>
            <span className="text-right">Desde</span>
          </div>
          <ul className="divide-y divide-line">
            {pos.map((p) => {
              const s = senal.get(p.ticker);
              return (
                <li key={p.ticker} className="grid grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_5rem_6.5rem_6rem] gap-x-3 items-center px-4 py-2 text-sm">
                  <Link href={`/accion/${p.ticker}`} className="flex items-center gap-2 min-w-0 hover:text-terracotta">
                    <TickerLogo symbol={p.ticker} size={26} />
                    <b>{p.ticker}</b>
                    <span className="sm:hidden num text-xs text-ink-soft">{p.peso.toFixed(1)}%</span>
                  </Link>
                  <span className="hidden sm:flex items-center gap-2">
                    <span className="flex-1 h-2 rounded-full bg-cream-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(p.peso / max) * 100}%`, background: "var(--terracotta)" }} /></span>
                    <span className="num text-xs font-bold w-10 text-right">{p.peso.toFixed(1)}%</span>
                  </span>
                  <span className="num text-right font-bold" style={{ color: (p.rent ?? 0) >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>{fmtPct(p.rent, 1, true)}</span>
                  <span className="hidden sm:flex justify-end">{s?.senal_key ? <SignalPill k={s.senal_key as SignalKey} label={s.senal ?? ""} /> : <span className="text-xs text-ink-soft">ETF</span>}</span>
                  <span className="text-right text-xs text-ink-soft">{p.desde ? fecha(p.desde) : "—"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <section>
        <Eyebrow className="mb-2">Movimientos · compras y ventas</Eyebrow>
        <Card className="p-0 overflow-hidden">
          <ul className="divide-y divide-line">
            {mov.map((m) => (
              <li key={`${m.fecha}${m.ticker}${m.tipo}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-x-3 items-center px-4 py-2 text-sm">
                <span className="text-xs text-ink-soft num">{fecha(m.fecha)}</span>
                <Link href={`/accion/${m.ticker}`} className="flex items-center gap-2 min-w-0 hover:text-terracotta">
                  <TickerLogo symbol={m.ticker} size={22} />
                  <b>{m.ticker}</b>
                  <span className="text-xs font-bold truncate" style={{ color: TIPO[m.tipo].color }}>{m.tipo === "venta" && (m.pct_posicion ?? 0) >= 99.9 ? "Venta total" : TIPO[m.tipo].txt}</span>
                </Link>
                <span className="text-xs text-right num">
                  {m.tipo === "compra" && m.pct_posicion != null && `+${m.pct_posicion.toFixed(0)}% a la posición`}
                  {m.tipo === "venta" && (
                    <>
                      vendió {m.pct_posicion?.toFixed(0)}% de la posición
                      {m.rent_pct != null && <b style={{ color: m.rent_pct >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}> · {fmtPct(m.rent_pct, 1, true)} realizado</b>}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <p className="text-xs text-ink-soft border-t border-line pt-3">
        Rentabilidad de cada posición = precio actual frente a su costo promedio. La de la cuenta es ponderada en el tiempo (TWR) de Interactive Brokers. No mostramos cantidades, precios de compra ni montos. Contenido educativo; no es una recomendación.
      </p>
    </div>
  );
}
