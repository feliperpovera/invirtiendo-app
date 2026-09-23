import type { NewsItem, SentimentResult, SentLabel, AnalystView, InsiderView, EarningsSurprise, CheckItem, ProviderName } from "./types";
import { labelFromScore } from "@/lib/providers/alphavantage";
import { isNum, clamp } from "@/lib/format";

/* ── Léxico financiero (inglés; las noticias vienen en inglés) ────── */
const PHRASES: Array<[RegExp, number]> = [
  [/raises? (full[- ]year|fy|annual|its) (guidance|outlook|forecast)/i, 2.5],
  [/beats? (estimates|expectations|forecasts|the street|consensus)/i, 2],
  [/record (revenue|profit|quarter|sales|high)/i, 2],
  [/(tops|exceeds|surpasses) (estimates|expectations|forecasts)/i, 2],
  [/price target (raised|hiked|lifted|increased)/i, 1.5],
  [/upgraded? to (buy|outperform|overweight)/i, 2],
  [/buyback|share repurchase|dividend (increase|hike|raise)/i, 1.2],
  [/strong demand|demand (remains|is) strong|robust demand/i, 1.5],
  [/all[- ]time high/i, 1],
  [/(wins|awarded|lands|secures) (a )?(contract|deal|order)/i, 1.5],
  [/(cuts?|lowers?|slashes|trims) (full[- ]year|fy|annual|its) (guidance|outlook|forecast)/i, -2.5],
  [/misses? (estimates|expectations|forecasts|the street|consensus)/i, -2],
  [/(falls? short|disappoint)/i, -1.5],
  [/downgraded? to (sell|underperform|underweight|neutral|hold)/i, -2],
  [/price target (cut|lowered|reduced|slashed)/i, -1.5],
  [/(antitrust|doj|ftc|eu) (probe|investigation|lawsuit|fine|ruling)/i, -1.8],
  [/(class action|lawsuit|sued|subpoena|sec investigation)/i, -1.5],
  [/(layoffs?|job cuts|restructuring charge)/i, -0.8],
  [/(recall|outage|breach|hack)/i, -1.5],
  [/(ceo|cfo) (steps down|resigns|departs|ousted)/i, -1.5],
  [/short seller|short report/i, -1.5],
  [/tariffs? (hit|weigh|threat|impact)/i, -1],
  [/(export (controls|restrictions|ban)|chip ban)/i, -1.5],
  [/stock (split)/i, 0.5],
  [/insider (buying|purchase)/i, 1],
  [/insider (selling|sale)/i, -0.6],
  [/(soars?|surges?|jumps?|rallies|climbs?|pops?) /i, 1.2],
  [/(plunges?|tumbles?|sinks?|slides?|slumps?|crashes|drops?|falls?) /i, -1.2],
];

const WORDS: Record<string, number> = {
  beat: 1.2, beats: 1.2, growth: 0.6, profit: 0.5, profitable: 0.8, upgrade: 1.2, bullish: 1.2, outperform: 1, strong: 0.7,
  accelerat: 0.8, expand: 0.5, momentum: 0.6, breakout: 0.6, win: 0.5, partnership: 0.6, launch: 0.4, innovat: 0.4, upside: 0.7,
  optimis: 0.7, resilien: 0.6, boost: 0.6, gain: 0.6, gains: 0.6, rebound: 0.6, dividend: 0.4, approval: 0.8, approved: 0.8,
  miss: -1.2, misses: -1.2, weak: -0.8, weakness: -0.9, decline: -0.7, declines: -0.7, slowdown: -1, slowing: -0.8, downgrade: -1.2,
  bearish: -1.2, underperform: -1, warning: -1, warns: -1, risk: -0.4, risks: -0.4, concern: -0.7, concerns: -0.7, loss: -0.8, losses: -0.8,
  lawsuit: -1, probe: -1, investigation: -1, fine: -0.6, penalty: -0.8, recall: -1, delay: -0.7, delayed: -0.7, cut: -0.6, cuts: -0.6,
  debt: -0.3, dilution: -0.8, offering: -0.6, bankruptcy: -2, fraud: -2, volatile: -0.4, overvalued: -1, bubble: -1, selloff: -1.2, "sell-off": -1.2,
  plunge: -1.2, tumble: -1.1, fear: -0.8, fears: -0.8, uncertainty: -0.6, headwind: -0.8, headwinds: -0.8, tailwind: 0.8, tailwinds: 0.8,
  record: 0.8, surge: 1, soar: 1, rally: 0.8, jump: 0.7, high: 0.3, low: -0.3, competition: -0.4, competitive: -0.2, disrupt: -0.3,
};

const NEGATORS = /\b(not|no|never|without|fails? to|unlikely)\b/i;

export function lexiconScore(text: string): number {
  const t = text.toLowerCase();
  let s = 0;
  let hits = 0;
  for (const [re, w] of PHRASES) if (re.test(t)) { s += w; hits++; }
  const tokens = t.replace(/[^a-z\- ]/g, " ").split(/\s+/);
  for (const tok of tokens) {
    const w = WORDS[tok] ?? Object.entries(WORDS).find(([k]) => k.length > 5 && tok.startsWith(k))?.[1];
    if (isNum(w)) { s += w; hits++; }
  }
  if (NEGATORS.test(t) && Math.abs(s) < 2) s *= -0.5;
  if (!hits) return 0;
  return clamp(Math.tanh(s / 3), -1, 1);
}

/* ── Temas ─────────────────────────────────────────────────────────── */
const TOPICS: Array<[string, RegExp]> = [
  ["Resultados y guía", /earnings|revenue|guidance|quarter|q[1-4]\b|eps|results|outlook|forecast|profit|margin/i],
  ["Producto e IA", /\bai\b|artificial intelligence|chip|gpu|model|launch|product|platform|cloud|data center|software|device|iphone|robot/i],
  ["Regulación y legal", /antitrust|regulat|lawsuit|doj|ftc|\beu\b|probe|fine|court|ruling|ban|tariff|export control|sec\b/i],
  ["Fusiones y capital", /acqui|merger|deal|buyback|repurchase|dividend|offering|debt|bond|split|spin/i],
  ["Analistas", /analyst|upgrade|downgrade|price target|rating|outperform|underperform|overweight|initiat/i],
  ["Macro y tasas", /fed\b|rates?|inflation|cpi|treasury|yield|recession|macro|jobs report|gdp/i],
  ["Dirección", /\bceo\b|\bcfo\b|executive|board|resign|steps down|appoint|founder|musk|zuckerberg|nadella|huang|cook\b/i],
  ["Competencia", /rival|competitor|competition|market share|vs\.?|versus|challenger/i],
];

export function classifyTopics(text: string): string[] {
  const out: string[] = [];
  for (const [name, re] of TOPICS) if (re.test(text)) out.push(name);
  return out.slice(0, 3);
}

const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);

/** Fusiona fuentes: mantiene el score de proveedor cuando existe, aplica léxico al resto. */
export function mergeNews(primary: NewsItem[], ...others: NewsItem[][]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  const push = (n: NewsItem) => {
    const k = normTitle(n.title);
    if (!k || seen.has(k)) return;
    seen.add(k);
    const text = `${n.title}. ${n.summary ?? ""}`;
    const topics = n.topics.length ? n.topics : classifyTopics(text);
    let sentiment = n.sentiment;
    if (sentiment.provider === "finnhub" || sentiment.provider === "yahoo" || sentiment.provider === "lexicon") {
      const score = lexiconScore(text);
      sentiment = { score, label: labelFromScore(score), relevance: null, provider: "lexicon" };
    }
    out.push({ ...n, topics, sentiment });
  };
  primary.forEach(push);
  others.forEach((arr) => arr.forEach(push));
  // Las fuentes que califican el sentimiento por ticker mandan: Finnhub y Yahoo
  // solo rellenan lo que quede libre, para que sus titulares no las desplacen.
  const byDate = (a: NewsItem, b: NewsItem) => b.publishedAt - a.publishedAt;
  const scored = out.filter((n) => n.sentiment.provider !== "lexicon").sort(byDate);
  const resto = out.filter((n) => n.sentiment.provider === "lexicon").sort(byDate);
  return [...scored.slice(0, 40), ...resto].slice(0, 40).sort(byDate);
}

export function sentimentPillar(
  news: NewsItem[],
  analyst: AnalystView | null,
  insiders: InsiderView | null,
  surprises: EarningsSurprise[],
  provider: ProviderName,
): SentimentResult {
  const now = Date.now();
  let wsum = 0;
  let acc = 0;
  let bullish = 0;
  let bearish = 0;
  let neutral = 0;
  const topicAgg = new Map<string, { count: number; sum: number }>();
  for (const n of news) {
    const ageDays = Math.max(0, (now - n.publishedAt) / 86400000);
    const recency = Math.pow(0.5, ageDays / 7); // vida media 7 días
    const rel = isNum(n.sentiment.relevance) ? 0.5 + n.sentiment.relevance : 1;
    const w = recency * rel;
    wsum += w;
    acc += n.sentiment.score * w;
    if (n.sentiment.score >= 0.15) bullish++;
    else if (n.sentiment.score <= -0.15) bearish++;
    else neutral++;
    for (const t of n.topics) {
      const cur = topicAgg.get(t) ?? { count: 0, sum: 0 };
      cur.count++;
      cur.sum += n.sentiment.score;
      topicAgg.set(t, cur);
    }
  }
  const score = wsum ? acc / wsum : 0;
  const label: SentLabel = labelFromScore(score);
  const topics = [...topicAgg.entries()].map(([topic, v]) => ({ topic, count: v.count, avgScore: v.sum / v.count })).sort((a, b) => b.count - a.count).slice(0, 6);
  const rank = (n: NewsItem) => Math.abs(n.sentiment.score) * (isNum(n.sentiment.relevance) ? 0.5 + n.sentiment.relevance : 1) * Math.pow(0.5, Math.max(0, (now - n.publishedAt) / 86400000) / 10);
  const drivers = {
    bullish: news.filter((n) => n.sentiment.score >= 0.15).sort((a, b) => rank(b) - rank(a)).slice(0, 3),
    bearish: news.filter((n) => n.sentiment.score <= -0.15).sort((a, b) => rank(b) - rank(a)).slice(0, 3),
  };

  const beats = surprises.filter((s) => isNum(s.surprisePct) && s.surprisePct >= 0).length;
  const items: CheckItem[] = [
    { key: "news", label: `Sentimiento de noticias (${news.length} titulares, 30 días)`, value: `${label} · ${score.toFixed(2)}`, pass: news.length ? score > -0.15 : null, detail: `${bullish} alcistas · ${neutral} neutrales · ${bearish} bajistas` },
    { key: "analyst", label: "Consenso de analistas", value: analyst ? `${analyst.consensus} (${analyst.strongBuy + analyst.buy} compra · ${analyst.hold} mantener · ${analyst.sell + analyst.strongSell} venta)` : "Sin datos (requiere Finnhub)", pass: analyst ? analyst.score > 0 : null, detail: "Contexto, no señal: el consenso suele llegar tarde" },
    { key: "insiders", label: "Insiders (3 meses)", value: insiders ? insiders.note : "Sin datos (requiere Finnhub)", pass: insiders && isNum(insiders.mspr) ? insiders.mspr > -30 : null },
    { key: "surprises", label: "Sorpresas de resultados (8 trimestres)", value: surprises.length ? `${beats}/${surprises.length} superan` : "Sin datos (requiere Finnhub)", pass: surprises.length >= 4 ? beats / surprises.length >= 0.6 : null },
  ];
  let pscore = 50 + score * 35;
  if (analyst) pscore += analyst.score * 10;
  if (insiders && isNum(insiders.mspr)) pscore += clamp(insiders.mspr / 20, -5, 5);
  pscore = clamp(Math.round(pscore), 0, 100);
  const verdict = pscore >= 55 ? "PASA" : pscore >= 45 ? "DUDOSO" : "FALLA";
  const topicTxt = topics.slice(0, 3).map((t) => `${t.topic} (${t.count})`).join(" · ");
  const summary = news.length
    ? `El mercado está ${label === "Bullish" || label === "Somewhat-Bullish" ? "constructivo" : label === "Neutral" ? "neutral" : "negativo"} con la acción. Temas: ${topicTxt || "varios"}.`
    : "Sin noticias recientes para este símbolo.";
  const notes = ["La señal la da el margin of safety, no el titular. El sentimiento sirve para entender QUÉ mueve el precio, no para decidir."];
  if (provider === "lexicon") notes.push("Sentimiento calculado con léxico propio (sin llave de Alpha Vantage). Con llave, la calificación mejora.");
  return {
    key: "sentiment",
    title: "Sentiment",
    score: pscore,
    verdict,
    summary,
    items,
    notes,
    news,
    aggregate: { score, label, bullish, bearish, neutral },
    topics,
    drivers,
    analyst,
    insiders,
    earningsSurprises: surprises,
    provider,
  };
}
