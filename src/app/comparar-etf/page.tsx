import type { Metadata } from "next";
import { CompareEtf } from "@/components/CompareEtf";
import { Eyebrow } from "@/components/ui";
import { normalizeSymbol } from "@/lib/evaluate";

export const metadata: Metadata = { title: "Comparar ETFs" };

export default async function CompareEtfPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const initial = (t ?? "")
    .split(",")
    .map((s) => normalizeSymbol(s))
    .filter((s) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s));
  return (
    <div className="pt-10 space-y-5">
      <div>
        <Eyebrow>Comparar ETFs</Eyebrow>
        <h1 className="font-display text-3xl sm:text-4xl leading-none">La comisión es lo único seguro. El resto son expectativas.</h1>
      </div>
      <CompareEtf initial={initial.length ? initial : ["QQQM", "VOO", "SMH"]} />
    </div>
  );
}
