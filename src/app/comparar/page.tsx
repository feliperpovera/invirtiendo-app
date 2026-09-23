import type { Metadata } from "next";
import { Compare } from "@/components/Compare";
import { Eyebrow } from "@/components/ui";
import { normalizeSymbol } from "@/lib/evaluate";

export const metadata: Metadata = { title: "Comparar" };

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const initial = (t ?? "")
    .split(",")
    .map((s) => normalizeSymbol(s))
    .filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s));
  return (
    <div className="pt-10 space-y-5">
      <div>
        <Eyebrow>Comparar acciones · <a href="/comparar-etf" className="underline">¿buscas ETFs?</a></Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">Aquí gana el PEG más bajo… si el negocio aguanta.</h1>
        <p className="text-ink-soft mt-3 max-w-2xl">Menor múltiplo es una señal, no una conclusión. Compara precio, calidad y riesgo lado a lado antes de decidir.</p>
      </div>
      <Compare initial={initial.length ? initial : ["NVDA", "AMD", "AVGO"]} />
    </div>
  );
}
