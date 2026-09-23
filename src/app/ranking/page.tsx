import type { Metadata } from "next";
import { leerRanking } from "@/lib/providers/ranking";
import { Ranking } from "@/components/Ranking";
import { Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Ranking Invirtiendo" };
export const dynamic = "force-dynamic";

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function RankingPage() {
  const filas = await leerRanking(100);
  const ultima = filas.reduce((m, r) => (r.actualizado > m ? r.actualizado : m), "");

  return (
    <div className="pt-10 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Eyebrow>Ranking Invirtiendo</Eyebrow>
          <h1 className="font-display text-4xl sm:text-5xl leading-none">Las acciones mejor calificadas.</h1>
        </div>
        {ultima && <p className="text-xs text-ink-soft">Se recalcula todos los días · actualizado {fecha(ultima)}</p>}
      </div>
      <Ranking filas={filas} />
    </div>
  );
}
