import type { Metadata } from "next";
import Link from "next/link";
import { leerPosiciones, leerMovimientos, leerResumen } from "@/lib/providers/portafolioPublico";
import { leerRanking } from "@/lib/providers/ranking";
import { nivelesIbkr } from "@/lib/providers/portafolioIbkr";
import { PortafolioVsSP } from "@/components/PortafolioVsSP";
import { CuentaViva, GananciaAnioVivo, PortafolioEnVivo, RendimientoCuenta, PctAnioVivo } from "@/components/PortafolioVivo";
import { PosicionesGraficas } from "@/components/PosicionesGraficas";
import { Movimientos } from "@/components/Movimientos";
import { Card, Eyebrow } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }): Promise<Metadata> {
  const c = (await searchParams).cuenta;
  return { title: c === "ga" ? "Portafolio GA" : c === "inv" ? "Portafolio INV" : "Portafolio Invirtiendoo" };
}
export const dynamic = "force-dynamic";

/** Cuentas públicas: #1 la de Invirtiendoo (sincronizada con IBKR) y #2 GA (cargada a mano desde su app de IBKR). */
const CUENTAS = [
  { id: "principal", titulo: "Portafolio Invirtiendoo", h1: "Nuestra cuenta real, a la vista." },
  { id: "ga", titulo: "Portafolio GA", h1: "Portafolio GA, a la vista." },
  { id: "inv", titulo: "Portafolio INV", h1: "Portafolio INV, desde 2010." },
];

export default async function PortafolioPage({ searchParams }: { searchParams: Promise<{ cuenta?: string }> }) {
  const pedida = (await searchParams).cuenta;
  const cuenta = CUENTAS.some((c) => c.id === pedida) ? pedida! : "principal";
  const principal = cuenta === "principal";
  const [pos, mov, res, rk, niveles] = await Promise.all([leerPosiciones(cuenta), leerMovimientos(cuenta), principal ? leerResumen() : Promise.resolve(null), leerRanking(200), principal ? nivelesIbkr().catch(() => []) : Promise.resolve([])]);
  // Rentabilidad por año calendario: % ponderado por tiempo (último nivel del año / último del año anterior)
  // y en dinero lo ganado vendiendo ese año; el año en curso suma además lo que va ganando lo que todavía se tiene.
  const anios = [...new Set([...niveles.map((n) => new Date(n.t).getUTCFullYear()), ...mov.map((m) => Number(m.fecha.slice(0, 4)))])].sort((a, b) => b - a);
  const anioActual = anios[0];
  const porAnio = anios.map((y) => {
    const ult = (yy: number) => niveles.filter((n) => new Date(n.t).getUTCFullYear() === yy).at(-1)?.c;
    const base = ult(y - 1) ?? niveles.find((n) => new Date(n.t).getUTCFullYear() === y)?.c;
    const fin = ult(y);
    const vendido = mov.filter((m) => m.fecha.startsWith(String(y))).reduce((a, m) => a + (m.pnl_realizado ?? 0), 0);
    return { y, pct: base && fin ? (fin / base - 1) * 100 : null, vendido };
  });
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
    <div className="pt-8 space-y-6">
      {/* Selector de portafolio: lo primero de la página */}
      <nav className="inline-flex max-w-full overflow-x-auto rounded-full bg-ink p-1 shadow-sm" aria-label="Elegir portafolio">
        {CUENTAS.map((c) => (
          <Link key={c.id} href={c.id === "principal" ? "/portafolio" : `/portafolio?cuenta=${c.id}`} aria-current={c.id === cuenta ? "page" : undefined} className={`whitespace-nowrap rounded-full px-3 sm:px-5 py-2 text-sm font-bold transition-colors ${c.id === cuenta ? "bg-terracotta text-cream" : "text-[#d8cdb9] hover:text-cream"}`}>
            <span className="hidden sm:inline">Portafolio </span>{c.titulo.replace("Portafolio ", "")}
          </Link>
        ))}
      </nav>
      <div>
        <Eyebrow>{CUENTAS.find((c) => c.id === cuenta)!.titulo}</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">{CUENTAS.find((c) => c.id === cuenta)!.h1}</h1>
        <p className="text-ink-soft mt-3 max-w-2xl text-sm">
          {principal
            ? "Cada acción, cada compra y cada venta de nuestra cuenta en Interactive Brokers. Valor y ganancias se calculan en vivo con precios de mercado sobre nuestras posiciones; las compras y ventas se cargan a mano desde IBKR"
            : cuenta === "inv"
            ? "Cuenta INV en BTG Pactual, abierta en octubre de 2010. Posiciones y costo según el extracto de BTG; valor y ganancias se calculan en vivo con precios de mercado. Se actualiza con cada extracto mensual"
            : "Posiciones de la cuenta GA en Interactive Brokers. Valor y ganancias se calculan en vivo con precios de mercado sobre sus cantidades y precio promedio; las posiciones se actualizan cuando hay compras o ventas"}
          {act ? ` (última actualización ${new Date(act).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" })})` : ""}.
        </p>
      </div>




      <CuentaViva pos={pos} ops={mov.map(({ fecha, ticker, tipo, cantidad, precio }) => ({ fecha, ticker, tipo, cantidad, precio })).slice(0, 60)} efectivo={res?.efectivo ?? null}>
      <PortafolioEnVivo realizado={realizado} ventas={ventas} senales={Object.fromEntries(pos.map((p) => [p.ticker, senal.get(p.ticker)?.senal_key ? { key: senal.get(p.ticker)!.senal_key!, label: senal.get(p.ticker)!.senal ?? "" } : undefined]))} />

      {porAnio.length > 0 && (
        <section className="space-y-2">
          <Eyebrow>Rentabilidad por año</Eyebrow>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {porAnio.map((a) => (
              <Card key={a.y} className="p-4">
                <p className="font-display text-2xl">{a.y}{a.y === anioActual && <span className="text-xs font-sans text-ink-soft ml-2">en curso</span>}</p>
                {principal && a.y === anioActual ? (
                  <PctAnioVivo respaldo={a.pct} />
                ) : a.pct != null && (
                  <p className="num font-display text-3xl leading-tight" style={{ color: a.pct >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>{fmtPct(a.pct, 2, true)}</p>
                )}
                {a.y === anioActual ? (
                  <GananciaAnioVivo vendido={a.vendido} />
                ) : (
                  <p className="num text-sm mt-1">
                    Ganancia en ventas: <b style={{ color: a.vendido >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>{a.vendido >= 0 ? "+" : "−"}{fmtMoney(Math.abs(a.vendido))}</b>
                  </p>
                )}
              </Card>
            ))}
          </div>
          <p className="text-xs text-ink-soft">{principal && "% = rentabilidad ponderada por tiempo, calculada con nuestras órdenes y los cierres de mercado (los aportes no cuentan como ganancia; sin dividendos, comisiones ni efectivo). "}Ganancia en dólares = ventas cerradas en el año más, en el año en curso, lo que van ganando a precio de ahora las posiciones abiertas, desde que se compraron.</p>
        </section>
      )}

      {principal && (
        <section className="space-y-2">
          <Eyebrow>Cómo se mueve la cuenta · frente al S&amp;P 500</Eyebrow>
          <RendimientoCuenta />
        </section>
      )}

      </CuentaViva>

      <PortafolioVsSP cuenta={cuenta} titulo={CUENTAS.find((c) => c.id === cuenta)!.titulo} />


      <PosicionesGraficas tickers={pos.map((p) => p.ticker)} movimientos={mov.map((m) => ({ fecha: m.fecha, ticker: m.ticker, tipo: m.tipo }))} />

      {mov.length > 0 && <Movimientos mov={mov} />}

      <p className="text-xs text-ink-soft border-t border-line pt-3">
        {cuenta === "inv"
          ? "Fuente: extracto mensual de BTG Pactual (cantidades y costo). Precios de mercado en vivo; la gráfica frente al índice es una simulación con las posiciones actuales. Contenido educativo; no es una recomendación."
          : "Fuente: operaciones de Interactive Brokers cargadas a mano y precios de mercado. La ganancia realizada es la que reportó IBKR en cada venta, después de comisiones; lo demás es cálculo propio y puede diferir de IBKR. " + (principal ? "La rentabilidad de la cuenta en la gráfica es ponderada en el tiempo (TWR), calculada con las órdenes. " : "La gráfica frente al índice es una simulación con las posiciones actuales. ") + "Contenido educativo; no es una recomendación."}
      </p>
    </div>
  );
}
