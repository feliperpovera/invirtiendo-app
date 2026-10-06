import type { Metadata } from "next";
import Link from "next/link";
import { leerRadar, type Movimiento, type PerfilRadar, type Persona } from "@/lib/providers/radar";
import { Card, Eyebrow } from "@/components/ui";
import { TickerLogo } from "@/components/TickerLogo";

export const metadata: Metadata = { title: "Radar del Poder" };
export const dynamic = "force-dynamic";

const QUIEN: Record<Persona, { nombre: string; rol: string; fuente: string; corto: string }> = {
  pelosi: { nombre: "Nancy Pelosi", rol: "Congresista de EE. UU. (California)", fuente: "Reportes PTR · Cámara de Representantes", corto: "Pelosi" },
  trump: { nombre: "Donald Trump", rol: "Presidente de EE. UU.", fuente: "Formulario OGE 278-T · Oficina de Ética del Gobierno", corto: "Trump" },
  thiel: { nombre: "Peter Thiel", rol: "Thiel Macro LLC", fuente: "Formulario 13F · SEC", corto: "Thiel" },
  berkshire: { nombre: "Berkshire Hathaway", rol: "El portafolio de Warren Buffett", fuente: "Formulario 13F · SEC", corto: "Buffett" },
  ackman: { nombre: "Bill Ackman", rol: "Pershing Square Capital", fuente: "Formulario 13F · SEC", corto: "Ackman" },
  druckenmiller: { nombre: "Stanley Druckenmiller", rol: "Duquesne Family Office", fuente: "Formulario 13F · SEC", corto: "Druckenmiller" },
  dalio: { nombre: "Ray Dalio", rol: "Bridgewater Associates", fuente: "Formulario 13F · SEC", corto: "Dalio" },
  wood: { nombre: "Cathie Wood", rol: "ARK Invest", fuente: "Formulario 13F · SEC", corto: "Wood" },
  tepper: { nombre: "David Tepper", rol: "Appaloosa", fuente: "Formulario 13F · SEC", corto: "Tepper" },
  soros: { nombre: "George Soros", rol: "Soros Fund Management", fuente: "Formulario 13F · SEC", corto: "Soros" },
};
const ORDEN: Persona[] = ["pelosi", "trump", "berkshire", "thiel", "ackman", "druckenmiller", "tepper", "wood", "dalio", "soros"];
const POLITICOS: Persona[] = ["pelosi", "trump"];
/** Rangos declarados en el reporte: "$1.0M – $5.0M". Es una estimación, no el monto exacto. */
const millones = (v?: number) => (!v ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : `$${Math.round(v / 1e3)}K`);

function TablaMontos({ titulo, items, tono }: { titulo: string; items: Movimiento[]; tono: "compra" | "venta" }) {
  const total = items.reduce((a, m) => [a[0] + (m.montoMin ?? 0), a[1] + (m.montoMax ?? 0)], [0, 0]);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-wider" style={{ color: tono === "compra" ? "var(--sig-strong)" : "var(--terracotta-deep)" }}>{titulo}</p>
        <p className="text-[0.68rem] text-ink-soft num">Total ≈ {millones(total[0])} – {millones(total[1])}</p>
      </div>
      {/* Filas en rejilla compacta: sin tabla de ancho mínimo, nada se cruza en desktop ni en móvil */}
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_2.2rem_7.5rem] sm:grid-cols-[minmax(0,1fr)_2.2rem_7.5rem_4.6rem] gap-x-2 text-[0.62rem] uppercase tracking-wider text-ink-soft border-b border-line pb-1">
        <span>Acción</span>
        <span className="text-right">Op.</span>
        <span className="text-right">Monto estimado</span>
        <span className="hidden sm:block text-right">Última</span>
      </div>
      <ul className="divide-y divide-line">
        {items.slice(0, 10).map((m) => (
          <li key={m.ticker} className="grid grid-cols-[minmax(0,1fr)_2.2rem_7.5rem] sm:grid-cols-[minmax(0,1fr)_2.2rem_7.5rem_4.6rem] gap-x-2 items-center py-1.5 text-xs">
            <Link href={`/accion/${m.ticker}`} className="flex items-center gap-1.5 min-w-0 hover:text-terracotta">
              <TickerLogo symbol={m.ticker} size={18} />
              <b className="shrink-0">{m.ticker}</b>
              <span className="truncate text-[0.68rem] text-ink-soft">{m.nombre}</span>
            </Link>
            <span className="num text-right">{m.veces}</span>
            <span className="num text-right font-bold whitespace-nowrap">{millones(m.montoMin)} – {millones(m.montoMax)}</span>
            <span className="hidden sm:block num text-right text-[0.68rem] text-ink-soft">{m.ultima.slice(2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Politico({ p }: { p: PerfilRadar & { actualizado: string } }) {
  const q = QUIEN[p.persona];
  return (
    <Card className="space-y-3 p-4 sm:p-5">
      <div>
        <Eyebrow>{q.rol}</Eyebrow>
        <h2 className="font-display text-2xl leading-none mt-0.5">{q.nombre}</h2>
        <p className="text-xs text-ink-soft mt-1">
          <a href={p.fuenteUrl} target="_blank" rel="noreferrer" className="underline">{q.fuente}</a> · {p.periodo} · actualizado {fecha(p.actualizado)}
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
        <TablaMontos titulo="Más compradas" items={p.compras} tono="compra" />
        <TablaMontos titulo="Más vendidas" items={p.ventas} tono="venta" />
      </div>
    </Card>
  );
}
const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", year: "numeric" });

function Lista({ titulo, items, tono }: { titulo: string; items: Movimiento[]; tono: "compra" | "venta" }) {
  return (
    <div>
      <p className="text-[0.68rem] font-bold uppercase tracking-wider" style={{ color: tono === "compra" ? "var(--sig-strong)" : "var(--terracotta-deep)" }}>
        {titulo}
      </p>
      {items.length ? (
        <ul className="mt-1.5 space-y-1">
          {items.slice(0, 6).map((m) => (
            <li key={m.ticker}>
              <Link href={`/accion/${m.ticker}`} className="flex items-center gap-2 text-sm hover:text-terracotta">
                <TickerLogo symbol={m.ticker} size={22} />
                <b className="w-14 shrink-0">{m.ticker}</b>
                <span className="truncate text-ink-soft text-xs flex-1">{m.nombre}</span>
                {m.veces > 1 && <span className="text-xs num text-ink-soft">×{m.veces}</span>}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-soft">Sin movimientos en el periodo.</p>
      )}
    </div>
  );
}

function Tarjeta({ p }: { p: PerfilRadar & { actualizado: string } }) {
  const q = QUIEN[p.persona];
  return (
    <Card className="flex flex-col gap-3 p-4 sm:p-5">
      <div>
        <Eyebrow>{q.rol}</Eyebrow>
        <h2 className="font-display text-2xl leading-none mt-0.5">{q.nombre}</h2>
        <p className="text-xs text-ink-soft mt-1">
          <a href={p.fuenteUrl} target="_blank" rel="noreferrer" className="underline">{q.fuente}</a> · {p.periodo}
        </p>
      </div>
      {p.posiciones.length > 0 && (
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-wider text-ink-soft">Mayores posiciones · % del portafolio</p>
          <ul className="mt-1.5 space-y-1">
            {p.posiciones.slice(0, 6).map((x) => (
              <li key={x.nombre} className="text-xs">
                <div className="flex items-center gap-2">
                  {x.ticker ? <TickerLogo symbol={x.ticker} size={22} /> : <span className="w-[22px]" />}
                  {x.ticker ? <Link href={`/accion/${x.ticker}`} className="font-bold w-14 shrink-0 hover:text-terracotta">{x.ticker}</Link> : <span className="w-14 shrink-0 text-xs truncate">{x.nombre}</span>}
                  <span className="flex-1 h-2 rounded-full bg-cream-2 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.min(100, x.peso * 2.5)}%`, background: "var(--olive)" }} /></span>
                  <span className="num w-12 text-right font-bold">{x.peso.toFixed(1)}%</span>
                  <span className="text-[0.65rem] w-14 text-right text-ink-soft">{x.cambio}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Lista titulo={p.posiciones.length ? "Compró o aumentó" : "Más compradas"} items={p.compras} tono="compra" />
        <Lista titulo={p.posiciones.length ? "Vendió o redujo" : "Más vendidas"} items={p.ventas} tono="venta" />
      </div>
      <p className="text-[0.65rem] text-ink-soft mt-auto">Actualizado {fecha(p.actualizado)}</p>
    </Card>
  );
}

export default async function RadarPage() {
  const perfiles = (await leerRadar()).filter((p) => QUIEN[p.persona]).sort((a, b) => ORDEN.indexOf(a.persona) - ORDEN.indexOf(b.persona));
  // Indicador Pelosi-Trump: acciones que compran a la vez dos o más de los cuatro
  const quien = new Map<string, { nombre: string; personas: Persona[] }>();
  for (const p of perfiles)
    for (const m of p.compras) {
      const v = quien.get(m.ticker) ?? { nombre: m.nombre, personas: [] };
      if (!v.personas.includes(p.persona)) v.personas.push(p.persona);
      quien.set(m.ticker, v);
    }
  const coinciden = [...quien.entries()].filter(([, v]) => v.personas.length >= 2).sort((a, b) => b[1].personas.length - a[1].personas.length).slice(0, 12);
  const politicos = perfiles.filter((p) => POLITICOS.includes(p.persona));
  const fondos = perfiles.filter((p) => !POLITICOS.includes(p.persona));

  return (
    <div className="pt-10 space-y-6">
      <div>
        <Eyebrow>Radar del Poder</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">¿Qué compran los que mueven el mercado?</h1>
        <p className="text-ink-soft mt-3 max-w-2xl">
          Políticos y grandes fondos reportan por ley lo que compran y venden. Leemos sus reportes oficiales cada semana y los ponemos en un solo lugar.
        </p>
      </div>

      <Card ink>
        <Eyebrow>Indicador Pelosi-Trump</Eyebrow>
        <h2 className="font-display text-2xl sm:text-3xl mt-1">Cuando el poder coincide</h2>
        <p className="text-sm muted mt-1">Acciones que compraron dos o más de los {perfiles.length} en su último periodo reportado.</p>
        {coinciden.length ? (
          <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
            {coinciden.map(([t, v]) => (
              <li key={t}>
                <Link href={`/accion/${t}`} className="flex items-center gap-3 rounded-xl border border-[#3a3831] px-2.5 py-1.5 hover:border-terracotta">
                  <TickerLogo symbol={t} size={28} />
                  <div className="min-w-0 flex-1">
                    <b>{t}</b> <span className="text-xs muted truncate">{v.nombre}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {v.personas.map((p) => (
                        <span key={p} className="pill text-[0.6rem] !py-0" style={{ background: "var(--terracotta)", color: "var(--cream)" }}>{QUIEN[p].corto}</span>
                      ))}
                    </div>
                  </div>
                  <span className="font-display text-xl" style={{ color: "var(--terracotta)" }}>{v.personas.length}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm muted">{perfiles.length ? "Esta semana no hay coincidencias." : "Cargando los primeros reportes…"}</p>
        )}
      </Card>

      <section className="space-y-4">
        <div>
          <Eyebrow>Políticos</Eyebrow>
          <h2 className="font-display text-3xl leading-none">Pelosi y Trump: qué compran, qué venden y cuánto</h2>
          <p className="text-sm text-ink-soft mt-1">Por ley no reportan el monto exacto, sino un rango por operación ($1K–$15K, $1M–$5M…). Sumamos esos rangos: el monto real está entre los dos valores.</p>
        </div>
        {politicos.map((p) => (
          <Politico key={p.persona} p={p} />
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <Eyebrow>Grandes fondos</Eyebrow>
          <h2 className="font-display text-3xl leading-none">El 13F de los inversionistas más seguidos</h2>
          <p className="text-sm text-ink-soft mt-1">Sus mayores posiciones en % del portafolio y lo que compraron o vendieron frente al trimestre anterior.</p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {fondos.map((p) => (
            <Tarjeta key={p.persona} p={p} />
          ))}
        </div>
      </section>

      <p className="text-xs text-ink-soft border-t border-line pt-3">
        Los reportes llegan con retraso: el 13F hasta 45 días después del trimestre; los de Pelosi y Trump, hasta 45 días después de cada operación. Las operaciones del cónyuge de Pelosi se reportan a su nombre. Los reportes de Trump son documentos escaneados: emparejamos cada nombre con la lista oficial de empresas de la SEC y omitimos bonos y lo que no se puede identificar. Contenido educativo, no es una recomendación.
      </p>
    </div>
  );
}
