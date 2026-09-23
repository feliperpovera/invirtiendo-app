import type { Metadata } from "next";
import { Simulador } from "@/components/Simulador";
import { Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Simulador de interés compuesto" };

export default function SimuladorPage() {
  return (
    <div className="pt-10 space-y-5">
      <div>
        <Eyebrow>Simulador · interés compuesto</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">No es cuánto metes. Es cuánto tiempo lo dejas.</h1>
        <p className="text-ink-soft mt-3 max-w-2xl">
          Pon tu aporte mensual, los años y la rentabilidad que esperas. Verás cuánto pusiste tú y cuánto puso el interés — que es la parte que casi nadie calcula bien.
        </p>
      </div>
      <Simulador />
    </div>
  );
}
