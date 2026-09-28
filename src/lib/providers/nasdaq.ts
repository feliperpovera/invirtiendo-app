import { cached } from "./cache";

/** Consenso anual de EPS de Nasdaq.com (sin llave): hasta 4 años fiscales con máximo, mínimo y número de analistas. */
export interface EpsAnual {
  fiscalEnd: string; // "Jan 2027"
  eps: number;
  high: number | null;
  low: number | null;
  n: number | null;
}

type Fila = { fiscalEnd: string; consensusEPSForecast: number; highEPSForecast?: number; lowEPSForecast?: number; noOfEstimates?: number };

export function nasdaqEpsForecast(symbol: string): Promise<EpsAnual[]> {
  return cached(`nasdaq:eps:v1:${symbol}`, 24 * 3600 * 1000, async () => {
    const r = await fetch(`https://api.nasdaq.com/api/analyst/${encodeURIComponent(symbol)}/earnings-forecast`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`nasdaq ${r.status}`);
    const j = (await r.json()) as { data?: { yearlyForecast?: { rows?: Fila[] } } };
    return (j.data?.yearlyForecast?.rows ?? [])
      .filter((f) => typeof f.consensusEPSForecast === "number")
      .map((f) => ({ fiscalEnd: f.fiscalEnd, eps: f.consensusEPSForecast, high: f.highEPSForecast ?? null, low: f.lowEPSForecast ?? null, n: f.noOfEstimates ?? null }));
  });
}
