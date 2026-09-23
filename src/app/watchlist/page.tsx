import type { Metadata } from "next";
import { WatchlistTable } from "@/components/WatchlistTable";
import { LeadGate } from "@/components/LeadGate";
import { Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return (
    <div className="pt-10 space-y-5">
      <div>
        <Eyebrow>Watchlist · precios en vivo</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">Vigilancia, no recomendación.</h1>
        <p className="text-ink-soft mt-3 max-w-2xl">Cada acción guarda su fair value y su buy zone del día en que la evaluaste. Cuando el precio llegue a la zona, la fila se ilumina. Registra tus tramos para ver costo promedio, rentabilidad del periodo y tasas efectivas mensual (EM) y anual (EA). Todo se guarda en este navegador.</p>
      </div>
      <LeadGate>
        <WatchlistTable />
      </LeadGate>
      <p className="text-xs text-ink-soft">Revisar el Fair Value solo cuando cambian los fundamentales (earnings, guía, tasas), no porque el precio se movió. Para actualizarlo, vuelve a evaluar la acción y pulsa «Actualizar en watchlist».</p>
    </div>
  );
}
