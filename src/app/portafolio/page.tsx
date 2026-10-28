import type { Metadata } from "next";
import Link from "next/link";
import { leerPosiciones, leerMovimientos, leerResumen, type MovimientoPublico } from "@/lib/providers/portafolioPublico";
import { leerRanking } from "@/lib/providers/ranking";
import { PortafolioVsSP } from "@/components/PortafolioVsSP";
import { PortafolioEnVivo, RendimientoCuenta } from "@/components/PortafolioVivo";
import { PosicionesGraficas } from "@/components/PosicionesGraficas";
import { TermometroIndices } from "@/components/TermometroIndices";
import { TickerLogo } from "@/components/TickerLogo";
import { Card, Eyebrow } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";

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

/** Cuentas públicas: #1 la de Invirtiendoo (sincronizada con IBKR) y #2 GA (cargada a mano desde su app de IBKR). */
const CUENTAS = [
  { id: "principal", titulo: "Portafolio #1 · Invirtiendoo" },
  { id: "ga", titulo: "Portafolio #2 · GA" },
];

export default async function PortafolioPage({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const pedida = (await searchParams).cuenta;
  const cuenta = CUENTAS.some((c) => c.id === pedida) ? pedida! : "principal";
  const principal = cuenta === "principal";
  const [pos, mov, res, rk] = await Promise.all([leerPosiciones(cuenta), leerMovimientos(cuenta), principal ? leerResumen() : Promise.resolve(null), leerRanking(200)]);
  const senal = new Map(rk.map((r) => [r.ticker, r]));
  const act = res?.actualizado ?? pos[0]?.actualizado;
  const realizado = mov.reduce((a, m) => a + (m.pnl_realizado ?? 0), 0);
  // Ventas por acción: ganancia realizada y el costo que se dio de baja (monto de la venta − ganancia)
  const ventas: Record<string, { realizado: number; costo: number }> = {};
  for (const m of mov) if (m.tipo === "venta" && m.monto != null) {
    const v = (ventas[m.ticker] ??= { realizado: 0, costo: 0 });
    v.realizado += m.pnl_realizado ?? 0;
    v.costo += m.monto - (m.pnl_realizado ?? 0);
  }

  return (
    <div className="pt-10 space-y-6">
      <div>
        <Eyebrow>Portafolio Invirtiendoo</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">Nuestra cuenta real, a la vista.</h1>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Elegir portafolio">
          {CUENTAS.map((c) => (
            <Link key={c.id} href={c.id === "principal" ? "/portafolio" : `/portafolio?cuenta=${c.id}`} aria-current={c.id === cuenta ? "page" : undefined} className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${c.id === cuenta ? "bg-ink text-cream" : "border border-line text-ink-soft hover:border-ink"}`}>
              {c.titulo}
            </Link>
          ))}
        </nav>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm">
          Cada acción, cada compra y cada venta de nuestra cuenta en Interactive Brokers. Valor y ganancias se calculan en vivo con precios de mercado sobre nuestras posiciones; las posiciones se revisan contra IBKR una vez al día
          {act ? ` (última revisión ${new Date(act).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" })})` : ""}.
        </p>
      </div>



      <TermometroIndices />

      <PortafolioEnVivo pos={pos} efectivo={res?.efectivo ?? null} realizado={realizado} ventas={ventas} senales={Object.fromEntries(pos.map((p) => [p.ticker, senal.get(p.ticker)?.senal_key ? { key: senal.get(p.ticker)!.senal_key!, label: senal.get(p.ticker)!.senal ?? "" } : undefined]))} />

      {principal && (
        <section className="space-y-2">
          <Eyebrow>Cómo se mueve la cuenta · frente al S&amp;P 500</Eyebrow>
          <RendimientoCuenta />
        </section>
      )}

      {principal && <PortafolioVsSP />}


      <PosicionesGraficas tickers={pos.map((p) => p.ticker)} movimientos={mov.map((m) => ({ fecha: m.fecha, ticker: m.ticker, tipo: m.tipo }))} />

      {mov.length > 0 && (
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
      )}

      <p className="text-xs text-ink-soft border-t border-line pt-3">
        Fuente: Interactive Brokers (posiciones, operaciones y valor de la cuenta). Compra prom. y ganancia según IBKR; la ganancia realizada es la que reporta IBKR en cada venta, después de comisiones. La rentabilidad de la cuenta en la gráfica es ponderada en el tiempo (TWR). Contenido educativo; no es una recomendación.
      </p>
    </div>
  );
}
