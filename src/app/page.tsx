import Link from "next/link";
import { SearchBox } from "@/components/SearchBox";
import { MarketPulseCard } from "@/components/MarketPulse";
import { RadarHoy } from "@/components/RadarHoy";
import { leerRanking } from "@/lib/providers/ranking";
import { IndicesMundo } from "@/components/IndicesMundo";
import { WatchlistTable } from "@/components/WatchlistTable";
import { Eyebrow } from "@/components/ui";
import { BullMark } from "@/components/Logo";

const UNIVERSE: Array<{ title: string; tickers: string[] }> = [
  { title: "MAG 7", tickers: ["AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA"] },
  { title: "Semis", tickers: ["AVGO", "TSM", "AMD", "ASML", "MU", "ARM"] },
  { title: "Satélites", tickers: ["NBIS", "PYPL", "SNDK", "CRWV", "PLTR"] },
  { title: "Calidad", tickers: ["COST", "V", "MA", "LLY", "BRK-B", "UNH"] },
];

const ETFS = ["QQQM", "VOO", "SPLG", "SMH", "SCHD", "VTI"];

export const revalidate = 600;

export default async function Home() {
  // Top 5 del radar: Strong Buy de calidad (A/B), por margen de seguridad; descuentos de 80%+ ya salen como Watch
  const top = (await leerRanking(300)).filter((r) => r.senal_key === "strong" && (r.grade === "A" || r.grade === "B")).sort((a, b) => (b.mos ?? 0) - (a.mos ?? 0)).slice(0, 5);
  return (
    <div className="space-y-8 pt-6">
      <IndicesMundo />

      <section className="relative z-30 text-center max-w-2xl mx-auto">
        <BullMark size={44} className="mx-auto mb-3" />
        <h1 className="font-display text-4xl sm:text-5xl leading-[0.95]">
          ¿Vale la pena esta acción?
        </h1>
        <div className="mt-5 text-left">
          <SearchBox autoFocus />
        </div>
      </section>

      <RadarHoy top={top} />

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

      <section className="card p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <p className="eyebrow">ETFs · núcleo del portafolio</p>
          <Link href="/comparar-etf" className="text-xs font-semibold text-terracotta hover:underline">
            Comparar ETFs →
          </Link>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ETFS.map((t) => (
            <Link key={t} href={`/comparar-etf?t=${t}`} className="pill border border-line hover:border-terracotta hover:text-terracotta text-ink">
              {t}
            </Link>
          ))}
        </div>
      </section>

      <MarketPulseCard />

      <section>
        <div className="flex items-end justify-between gap-3 mb-2">
          <Eyebrow>Watchlist</Eyebrow>
          <Link href="/watchlist" className="text-sm font-semibold text-terracotta hover:underline">
            Ver todo →
          </Link>
        </div>
        <WatchlistTable preview />
      </section>
    </div>
  );
}
