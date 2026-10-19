import type { Metadata } from "next";
import { leerRanking } from "@/lib/providers/ranking";
import { MapaCalor } from "@/components/MapaCalor";
import { Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Mapa de calor" };
export const dynamic = "force-dynamic";

export default async function MapaPage() {
  const filas = await leerRanking(300);
  return (
    <div className="pt-10 space-y-5">
      <div>
        <Eyebrow>Mapa de calor</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">¿Dónde está barato el mercado?</h1>
        <p className="text-ink-soft mt-3 text-sm max-w-2xl">Cada cuadro es una acción del universo Invirtiendo, del tamaño de su empresa. En verde, las que cotizan por debajo de su Fair Value; en ladrillo, las que están caras.</p>
      </div>
      <MapaCalor filas={filas} />
    </div>
  );
}
