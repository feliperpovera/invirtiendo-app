import type { Metadata } from "next";
import Link from "next/link";
import { evaluateCached, EvaluationError, normalizeSymbol } from "@/lib/evaluate";
import { EvaluationView } from "@/components/evaluation/EvaluationView";
import { Card, Eyebrow } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import type { Quote } from "@/lib/analysis/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const { ticker } = await params;
  const s = normalizeSymbol(decodeURIComponent(ticker));
  return { title: `${s} · Evaluación`, description: `Checklist Buffett de 7 filtros, valor intrínseco, riesgo, competidores y noticias de ${s}.` };
}

export default async function Page({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = normalizeSymbol(decodeURIComponent(ticker));
  try {
    const ev = await evaluateCached(symbol);
    return <EvaluationView ev={ev} />;
  } catch (e) {
    if (e instanceof EvaluationError && e.code === "ETF") {
      const q = (e.extra as { quote?: Quote } | undefined)?.quote;
      return (
        <div className="pt-10 max-w-2xl mx-auto">
          <Card ink>
            <Eyebrow>{symbol} · {q?.quoteType ?? "ETF"}</Eyebrow>
            <h1 className="font-display text-3xl mt-1">{q?.name ?? symbol}</h1>
            {q && (
              <p className="num text-2xl mt-2">
                {fmtMoney(q.price)} <span className="text-sm muted">{q.changePct !== null ? `${q.changePct > 0 ? "+" : ""}${q.changePct.toFixed(2)}% hoy` : ""}</span>
              </p>
            )}
            <p className="mt-4 text-sm muted">{e.message}</p>
            <div className="mt-4 rounded-xl bg-[#2f2d27] p-4 text-sm">
              <p className="font-bold mb-1">Checklist ETF Invirtiendo</p>
              <ol className="list-decimal list-inside space-y-1 muted">
                <li>Exposición: ¿qué índice o tema replica y qué peso tienen las 10 mayores posiciones?</li>
                <li>Costos y composición: ratio de gastos, número de posiciones, concentración.</li>
                <li>Sentimiento: no se compra un ETF porque «sube»; se compra por aportes periódicos.</li>
                <li>Portafolio: núcleo ~60% en ETFs amplios (QQQM, SPYM, SMH según tu edad y tolerancia).</li>
              </ol>
            </div>
            <div className="flex flex-wrap gap-2 mt-5">
              <Link href={`/comparar-etf?t=${symbol}`} className="btn btn-primary">
                Analizar este ETF
              </Link>
              <Link href="/" className="btn btn-ghost text-cream border-[#4a4740]">
                Evaluar una acción
              </Link>
            </div>
          </Card>
        </div>
      );
    }
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return (
      <div className="pt-10 max-w-2xl mx-auto">
        <Card>
          <Eyebrow>No pude evaluar {symbol}</Eyebrow>
          <h1 className="font-display text-3xl mt-1">Algo no cuadra con ese símbolo.</h1>
          <p className="mt-3 text-ink-soft">{msg}</p>
          <ul className="mt-4 text-sm list-disc list-inside text-ink-soft space-y-1">
            <li>Usa el ticker de EE. UU. tal como aparece en tu bróker (NVDA, MSFT, BRK-B, TSM).</li>
            <li>Si la empresa cotiza solo fuera de EE. UU., aún no está cubierta.</li>
            <li>Si el proveedor de datos está saturado, vuelve a intentarlo en un minuto.</li>
          </ul>
          <Link href="/" className="btn btn-primary mt-5">
            Volver a buscar
          </Link>
        </Card>
      </div>
    );
  }
}
