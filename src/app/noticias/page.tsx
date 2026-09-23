import type { Metadata } from "next";
import { Card, Eyebrow } from "@/components/ui";
import { TimeAgo } from "@/components/ClientTime";
import { finnhubEnabled, finnhubGeneralNews } from "@/lib/providers/finnhub";
import { marketauxEnabled, marketauxGeneral } from "@/lib/providers/marketaux";
import { polygonEnabled, polygonGeneral } from "@/lib/providers/polygon";
import { mergeNews } from "@/lib/analysis/sentiment";
import type { NewsItem, SentLabel } from "@/lib/analysis/types";

export const metadata: Metadata = { title: "Noticias" };
export const dynamic = "force-dynamic";

const COLOR: Record<SentLabel, [string, string, string]> = {
  Bullish: ["var(--sig-strong)", "var(--cream)", "Alcista"],
  "Somewhat-Bullish": ["var(--sig-good)", "var(--cream)", "Algo alcista"],
  Neutral: ["var(--cream-2)", "var(--ink-soft)", "Neutral"],
  "Somewhat-Bearish": ["var(--sig-wait)", "var(--cream)", "Algo bajista"],
  Bearish: ["var(--sig-avoid)", "var(--cream)", "Bajista"],
};

export default async function NoticiasPage() {
  const [pg, mx, fh] = await Promise.all([
    polygonEnabled() ? polygonGeneral().catch(() => [] as NewsItem[]) : Promise.resolve([] as NewsItem[]),
    marketauxEnabled() ? marketauxGeneral().catch(() => [] as NewsItem[]) : Promise.resolve([] as NewsItem[]),
    finnhubEnabled() ? finnhubGeneralNews().catch(() => [] as NewsItem[]) : Promise.resolve([] as NewsItem[]),
  ]);
  const news = mergeNews(pg.length ? pg : mx, pg.length ? mx : [], fh).slice(0, 40);
  const bull = news.filter((n) => n.sentiment.score >= 0.15).length;
  const bear = news.filter((n) => n.sentiment.score <= -0.15).length;
  return (
    <div className="pt-10 space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <Eyebrow>Noticias del mercado · hoy</Eyebrow>
          <h1 className="font-display text-4xl leading-none">Qué mueve el mercado.</h1>
        </div>
        <p className="text-sm">
          <b style={{ color: "var(--sig-strong)" }}>▲ {bull}</b> · <b style={{ color: "var(--sig-avoid)" }}>▼ {bear}</b> · {news.length} titulares
        </p>
      </div>
      <Card className="p-0 overflow-hidden">
        {news.length === 0 && <p className="p-5 text-sm text-ink-soft">Sin noticias: configura Polygon o Finnhub en Fuentes.</p>}
        <ul className="px-4">
          {news.map((n) => {
            const [bg, fg, es] = COLOR[n.sentiment.label];
            return (
              <li key={n.id} className="py-3 border-b border-line-soft last:border-none flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-medium leading-snug hover:text-terracotta">
                    {n.title}
                  </a>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {n.source} · <TimeAgo ts={n.publishedAt} />
                    {n.topics.length > 0 && <> · {n.topics.join(" · ")}</>}
                  </p>
                </div>
                <span className="pill text-[0.68rem] shrink-0" style={{ background: bg, color: fg }}>
                  {es}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
