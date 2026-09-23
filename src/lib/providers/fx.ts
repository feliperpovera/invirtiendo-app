/**
 * Tipo de cambio USD→COP, sin llave (fawazahmed0/currency-api, catálogo public-apis,
 * sección Currency Exchange). Se sirve por CDN (jsDelivr) y se actualiza una vez al día.
 * El público de Invirtiendo piensa en pesos: es la referencia para leer el precio en COP.
 */
import { fetchJson } from "./http";
import { cached } from "./cache";

export function usdCop(): Promise<{ rate: number; date: string } | null> {
  return cached("fx:usdcop", 6 * 3600 * 1000, async () => {
    const r = await fetchJson<{ date: string; usd: Record<string, number> }>(
      "fx",
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json",
      { timeoutMs: 5000 },
    );
    const rate = r.usd?.cop;
    // Sanidad: un peso colombiano fuera de este rango es un dato roto, no una devaluación
    return typeof rate === "number" && rate > 1000 && rate < 10000 ? { rate, date: r.date } : null;
  });
}
