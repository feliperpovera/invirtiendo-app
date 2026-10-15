import type { Metadata } from "next";
import Link from "next/link";
import { leerPosiciones, leerMovimientos, leerResumen, type MovimientoPublico } from "@/lib/providers/portafolioPublico";
import { leerRanking } from "@/lib/providers/ranking";
import { PortafolioVsSP } from "@/components/PortafolioVsSP";
import { TickerLogo } from "@/components/TickerLogo";
import { Card, Eyebrow, SignalPill } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { SignalKey } from "@/lib/analysis/types";

export const metadata: Metadata = { title: "Portafolio Invirtiendoo" };
export const dynamic = "force-dynamic";

const fecha = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
const cant = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 4 }));
const signo = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : "-"}${fmtMoney(Math.abs(v))}`);
const color = (v: number | null | undefined) => ((v ?? 0) >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)");
const TIPO: Record<MovimientoPublico["tipo"], { txt: string; color: string }> = {
  nueva: { txt: "Nueva posición", color: "var(--sig-strong)" },
  compra: { txt: "Compra", color: "var(--olive-deep)" },
  venta: { txt: "Venta parcial", color: "var(--terracotta-deep)" },
};
const COLS = "grid-cols-[minmax(0,1fr)_5.5rem_5.5rem] lg:grid-cols-[minmax(0,1.1fr)_4.5rem_5.5rem_5.5rem_6rem_6.5rem_6.5rem]";

export default async function PortafolioPage() {
  const [pos, mov, res, rk] = await Promise.all([leerPosiciones(), leerMovimientos(), leerResumen(), leerRanking(200)]);
  const senal = new Map(rk.map((r) => [r.ticker, r]));
  const valor = pos.reduce((a, p) => a + (p.valor ?? 0), 0);
  const pnl = pos.reduce((a, p) => a + (p.pnl ?? 0), 0);
  const costo = valor - pnl;
  const pnlDia = pos.reduce((a, p) => a + (p.pnl_dia ?? 0), 0);
  const realizado = mov.reduce((a, m) => a + (m.pnl_realizado ?? 0), 0);
  const act = res?.actualizado ?? pos[0]?.actualizado;

  const kpis: Array<[string, string, string?]> = [
    ["Valor de la cuenta", fmtMoney(res?.nav ?? valor)],
    ["Invertido en posiciones", fmtMoney(costo)],
    ["Ganancia no realizada", `${signo(pnl)} · ${fmtPct(costo ? (pnl / costo) * 100 : null, 1, true)}`, color(pnl)],
    ["Ganancia realizada", signo(realizado), color(realizado)],
    ["Hoy", signo(pnlDia), color(pnlDia)],
    ["Efectivo", fmtMoney(res?.efectivo ?? null)],
  ];

  return (
    <div className="pt-10 space-y-6">
      <div>
        <Eyebrow>Portafolio Invirtiendoo</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">Nuestra cuenta real, a la vista.</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm">
          Cada acción, cada compra y cada venta de nuestra cuenta en Interactive Brokers, con sus números. Los datos vienen directo de IBKR y se actualizan solos cada día hábil
          {act ? ` · último corte ${new Date(act).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" })}` : ""}.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {kpis.map(([k, v, c]) => (
          <Card key={k} className="p-3 sm:p-4">
            <p className="text-[0.62rem] uppercase tracking-wider text-ink-soft font-bold">{k}</p>
            <p className="num font-display text-xl sm:text-2xl mt-1 leading-tight" style={c ? { color: c } : undefined}>{v}</p>
          </Card>
        ))}
      </div>

      <PortafolioVsSP />

      <section>
        <Eyebrow className="mb-2">Posiciones · {pos.length}</Eyebrow>
        <Card className="p-0 overflow-hidden">
          <div className={`grid ${COLS} gap-x-3 px-4 py-2 text-[0.6rem] uppercase tracking-wider text-ink-soft border-b border-line`}>
            <span>Acción</span>
            <span className="hidden lg:block text-right">Cantidad</span>
            <span className="hidden lg:block text-right">Compra prom.</span>
            <span className="text-right">Precio hoy</span>
            <span className="hidden lg:block text-right">Valor</span>
            <span className="text-right">Ganancia</span>
            <span className="hidden lg:block text-right">Señal hoy</span>
          </div>
          <ul className="divide-y divide-line">
            {pos.map((p) => {
              const s = senal.get(p.ticker);
              return (
                <li key={p.ticker} className={`grid ${COLS} gap-x-3 items-center px-4 py-2 text-sm`}>
                  <Link href={`/accion/${p.ticker}`} className="flex items-center gap-2 min-w-0 hover:text-terracotta">
                    <TickerLogo symbol={p.ticker} size={26} />
                    <span className="min-w-0">
                      <b>{p.ticker}</b> <span className="num text-xs text-ink-soft">{p.peso.toFixed(1)}%</span>
                      <span className="block text-[0.65rem] text-ink-soft lg:hidden num">{cant(p.cantidad)} × {fmtMoney(p.precio_prom)} prom.</span>
                      {p.desde && <span className="hidden lg:block text-[0.65rem] text-ink-soft">desde {fecha(p.desde)}</span>}
                    </span>
                  </Link>
                  <span className="hidden lg:block num text-right">{cant(p.cantidad)}</span>
                  <span className="hidden lg:block num text-right">{fmtMoney(p.precio_prom)}</span>
                  <span className="num text-right">{fmtMoney(p.precio)}</span>
                  <span className="hidden lg:block num text-right font-bold">{fmtMoney(p.valor)}</span>
                  <span className="num text-right font-bold leading-tight" style={{ color: color(p.pnl) }}>
                    {signo(p.pnl)}
                    <span className="block text-[0.7rem]">{fmtPct(p.rent, 1, true)}</span>
                  </span>
                  <span className="hidden lg:flex justify-end">{s?.senal_key ? <SignalPill k={s.senal_key as SignalKey} label={s.senal ?? ""} /> : <span className="text-xs text-ink-soft">ETF</span>}</span>
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
                <span className="text-xs text-right num leading-tight">
                  {cant(m.cantidad)} × {fmtMoney(m.precio)} = <b>{fmtMoney(m.monto)}</b>
                  <span className="block text-ink-soft">
                    {m.tipo === "compra" && m.pct_posicion != null && `+${m.pct_posicion.toFixed(0)}% a la posición`}
                    {m.tipo === "venta" && (
                      <>
                        {m.pct_posicion?.toFixed(0)}% de la posición ·{" "}
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

      <p className="text-xs text-ink-soft border-t border-line pt-3">
        Fuente: Interactive Brokers (posiciones, operaciones y valor de la cuenta). Compra prom. y ganancia según IBKR; la ganancia realizada es la que reporta IBKR en cada venta, después de comisiones. La rentabilidad de la cuenta en la gráfica es ponderada en el tiempo (TWR). Contenido educativo; no es una recomendación.
      </p>
    </div>
  );
}
