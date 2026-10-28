import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui";
import { CalendarioResultados } from "@/components/CalendarioResultados";

export const metadata: Metadata = { title: "Calendario de resultados" };

export default function CalendarioPage() {
  return (
    <div className="pt-10 space-y-5">
      <div>
        <Eyebrow>Calendario de resultados</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">¿Quién reporta y qué esperar?</h1>
        <p className="text-ink-soft mt-3 text-sm max-w-2xl">Por día, semana, mes o año. Toca una empresa para ver EPS, ingresos, crecimiento, el indicador clave de su sector y nuestra señal. Regla del método: no se amplía una posición en la semana del reporte.</p>
      </div>
      <CalendarioResultados />
      <p className="text-xs text-ink-soft">Fuente: calendario de resultados de Nasdaq.com y Yahoo Finance. Señal y margen: modelo Invirtiendo.</p>
    </div>
  );
}
