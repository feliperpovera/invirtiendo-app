import type { Metadata } from "next";
import { normalizeSymbol } from "@/lib/evaluate";
import { EvaluacionCliente } from "./EvaluacionCliente";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  const s = normalizeSymbol(decodeURIComponent(ticker));
  return { title: `${s} · Evaluación`, description: `Checklist Buffett de 7 filtros, valor intrínseco, riesgo, competidores y noticias de ${s}.` };
}

export default async function Page({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  return <EvaluacionCliente symbol={normalizeSymbol(decodeURIComponent(ticker))} />;
}
