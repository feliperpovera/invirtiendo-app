import type { Metadata } from "next";
import Link from "next/link";
import { proximosResultados } from "@/lib/providers/earnings";
import { leerRanking } from "@/lib/providers/ranking";
import { Card, Eyebrow, SignalPill } from "@/components/ui";
import { TickerLogo } from "@/components/TickerLogo";
import { fmtBig, fmtPct } from "@/lib/format";
import type { SignalKey } from "@/lib/analysis/types";

export const metadata: Metadata = { title: "Calendario de resultados" };
export const revalidate = 3600;

const HORA = { antes: "Antes de abrir", despues: "Después del cierre", nd: "Hora sin confirmar" };
const dia = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

export default async function CalendarioPage() {
  const [res, rk] = await Promise.all([proximosResultados(15), leerRanking(300)]);
  const nuestro = new Map(rk.map((r) => [r.ticker, r]));
  // Empresas grandes (≥ $10B) o del universo Invirtiendo: el resto es ruido para nuestro proceso
  const filas = res.filter((r) => nuestro.has(r.ticker) || (r.marketCap ?? 0) >= 1e10).sort((a, b) => a.fecha.localeCompare(b.fecha) || (b.marketCap ?? 0) - (a.marketCap ?? 0));
  const fechas = [...new Set(filas.map((f) => f.fecha))];

  return (
    <div className="pt-10 space-y-5">
      <div>
        <Eyebrow>Calendario de resultados</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">Quién reporta en las próximas tres semanas.</h1>
        <p className="text-ink-soft mt-3 text-sm max-w-2xl">Empresas de más de $10B y todo el universo Invirtiendo, con su señal y margen de seguridad de hoy. Regla del método: no se amplía una posición en la semana del reporte.</p>
      </div>
      {!fechas.length && <p className="text-sm text-ink-soft">No pude leer el calendario ahora. Intenta en unos minutos.</p>}
      {fechas.map((f) => (
        <section key={f}>
          <Eyebrow className="mb-2 capitalize">{dia(f)}</Eyebrow>
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-line">
              {filas.filter((x) => x.fecha === f).map((x) => {
                const r = nuestro.get(x.ticker);
                return (
                  <li key={x.ticker} className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.4fr)_9rem_6rem_7rem_6rem] gap-x-3 gap-y-1 items-center px-4 py-2 text-sm">
                    <Link href={`/accion/${x.ticker}`} className="flex items-center gap-2 min-w-0 hover:text-terracotta">
                      <TickerLogo symbol={x.ticker} size={24} />
                      <b>{x.ticker}</b>
                      <span className="truncate text-xs text-ink-soft">{x.nombre}</span>
                    </Link>
                    <span className="text-xs text-ink-soft sm:order-none text-right sm:text-left">{HORA[x.hora]}</span>
                    <span className="hidden sm:block num text-xs text-right">{x.epsEstimado != null ? `EPS est. ${x.epsEstimado.toFixed(2)}` : "—"}</span>
                    <span className="hidden sm:flex justify-end">{r?.senal_key ? <SignalPill k={r.senal_key as SignalKey} label={r.senal ?? ""} /> : <span className="text-xs text-ink-soft">{fmtBig(x.marketCap)}</span>}</span>
                    <span className="hidden sm:block num text-xs text-right" style={{ color: r?.mos == null ? undefined : r.mos >= 15 ? "var(--sig-strong)" : r.mos >= -10 ? "var(--sig-watch)" : "var(--sig-avoid)" }}>
                      {r ? `${fmtPct(r.mos, 0, true)} margen` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ))}
      <p className="text-xs text-ink-soft">Fuente: calendario de resultados de Nasdaq.com. Señal y margen: modelo Invirtiendo.</p>
    </div>
  );
}
