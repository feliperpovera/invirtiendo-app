import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { BullMark } from "@/components/Logo";

const UNIVERSE: Array<{ title: string; tickers: string[] }> = [
  { title: "MAG 7", tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"] },
  { title: "Semis", tickers: ["AVGO", "TSM", "AMD", "ASML", "MU", "ARM"] },
  { title: "ETFs", tickers: ["QQQM", "SPYM", "VOO", "SMH", "TQQQ", "SCHD"] },
  { title: "Calidad", tickers: ["COST", "V", "MA", "LLY", "BRK-B", "UNH"] },
];

export default function Home() {
  return (
    <div className="space-y-6 pt-6">
      <section className="text-center max-w-2xl mx-auto">
        <BullMark size={44} className="mx-auto mb-3" />
        <h1 className="font-display text-4xl sm:text-5xl leading-[0.95]">¿Vale la pena esta acción?</h1>
        <div className="mt-5 text-left">
          <SearchBox autoFocus />
        </div>
      </section>

      <Link href="/portafolio" className="card p-4 flex items-center justify-between gap-3 hover:border-terracotta">
        <span>
          <span className="eyebrow block">Nuestro portafolio</span>
          <span className="font-display text-xl">Posiciones, rendimiento y movimientos</span>
        </span>
        <span className="text-terracotta font-bold">→</span>
      </Link>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {UNIVERSE.map((u) => (
          <div key={u.title} className="card p-3">
            <p className="eyebrow mb-2">{u.title}</p>
            <div className="flex flex-wrap gap-1.5">
              {u.tickers.map((t) => (
                <Link key={t} href={`/accion/${t}`} className="pill border border-line hover:border-terracotta hover:text-terracotta text-ink">
                  {t}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
