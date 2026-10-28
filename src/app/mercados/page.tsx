import type { Metadata } from "next";
import { connection } from "next/server";
import { mercados } from "@/lib/providers/mercados";
import { Card, Eyebrow } from "@/components/ui";
import { Sparkline } from "@/components/charts";
import { fmtPct } from "@/lib/format";
import { FearGreed } from "@/components/FearGreed";

export const metadata: Metadata = { title: "Mercados" };

const precio = (v: number, tasa: boolean) => (tasa ? `${v.toFixed(2)}%` : v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : 2 }));
const tono = (v: number | null) => ((v ?? 0) >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)");

export default async function MercadosPage() {
  await connection(); // se arma en cada visita (Yahoo + caché de 5 min); prerenderizada quedaba vacía si Yahoo fallaba en el build
  const m = await mercados().catch(() => []);
  const grupos = [...new Set(m.map((x) => x.grupo))];
  return (
    <div className="pt-10 space-y-6">
      <div>
        <Eyebrow>Mercados</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">El mercado de un vistazo.</h1>
        <p className="text-ink-soft mt-3 text-sm">Índices, tasas, dólar, materias primas y cripto. Precios con hasta 15 min de retraso (Yahoo Finance).</p>
      </div>
      <FearGreed />
      {m.length === 0 && <p className="text-ink-soft text-sm">No pudimos cargar los precios en este momento. Recarga la página en unos segundos.</p>}
      {grupos.map((g) => (
        <section key={g}>
          <Eyebrow className="mb-2">{g}</Eyebrow>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {m.filter((x) => x.grupo === g).map((x) => (
              <Card key={x.symbol} className="p-4">
                <p className="text-xs text-ink-soft truncate">{x.nombre}</p>
                <div className="flex items-baseline justify-between gap-2 mt-1">
                  <span className="num font-display text-2xl">{precio(x.precio, x.tasa)}</span>
                  <span className="num text-sm font-bold" style={{ color: tono(x.cambio) }}>{fmtPct(x.cambio, 2, true)}</span>
                </div>
                <Sparkline points={x.serie} width={240} height={44} stroke="auto" responsive />
                <p className="text-[0.7rem] text-ink-soft mt-1 num">
                  Año <b style={{ color: tono(x.ytd) }}>{fmtPct(x.ytd, 1, true)}</b> · 12 meses <b style={{ color: tono(x.a1) }}>{fmtPct(x.a1, 1, true)}</b>
                </p>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
