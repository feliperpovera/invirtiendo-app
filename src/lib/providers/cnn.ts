/** CNN Fear & Greed Index (endpoint público de CNN Markets). Fallback: cálculo propio. */
import { fetchJson } from "./http";
import { cached, TTL } from "./cache";

export interface CnnFearGreed {
  score: number;
  rating: string;
  previousClose: number | null;
  previousWeek: number | null;
  previousMonth: number | null;
  previousYear: number | null;
  asOf: string;
}

interface Resp {
  fear_and_greed: { score: number; rating: string; timestamp: string; previous_close?: number; previous_1_week?: number; previous_1_month?: number; previous_1_year?: number };
}

export async function cnnFearGreed(): Promise<CnnFearGreed> {
  return cached("cnn:fg", TTL.market, async () => {
    const d = await fetchJson<Resp>("yahoo", "https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        Accept: "application/json",
        Referer: "https://www.cnn.com/markets/fear-and-greed",
      },
    });
    const f = d.fear_and_greed;
    return { score: f.score, rating: f.rating, previousClose: f.previous_close ?? null, previousWeek: f.previous_1_week ?? null, previousMonth: f.previous_1_month ?? null, previousYear: f.previous_1_year ?? null, asOf: f.timestamp };
  });
}
