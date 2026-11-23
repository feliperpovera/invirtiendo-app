import type { Metadata } from "next";
import { FearGreed } from "@/components/FearGreed";
import { VixHistorico } from "@/components/VixHistorico";
import { Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Fear & Greed", description: "Índice de miedo y codicia del mercado: hoy, lecturas pasadas e historia por periodo." };

export default function Page() {
  return (
    <div className="space-y-4 pt-6">
      <div>
        <Eyebrow>Fear &amp; Greed</Eyebrow>
        <h1 className="font-display text-3xl sm:text-4xl leading-tight mt-1">¿El mercado tiene miedo o codicia?</h1>
      </div>
      <FearGreed />
      <VixHistorico />
    </div>
  );
}
