/**
 * Universo Invirtiendo: las acciones que el ranking reevalúa todos los días.
 * Lo que la gente evalúa por su cuenta también entra al ranking y se refresca igual.
 */
export const UNIVERSO: string[] = [
  "AAPL", "ABBV", "ABNB", "ABT", "ACN", "ADBE", "ADI", "ADSK", "AMAT", "AMD", "AMZN", "ANET", "ARM", "ASML", "AVGO", "AXP",
  "BA", "BAC", "BRK-B", "CAT", "CDNS", "COIN", "COST", "CRM", "CRWD", "CRWV", "CSCO", "CVX", "DASH", "DDOG", "DE", "DELL",
  "DIS", "EA", "EBAY", "F", "GE", "GM", "GOOGL", "GS", "HD", "HON", "HOOD", "IBM", "INTC", "INTU", "ISRG", "JPM", "KLAC",
  "KO", "LLY", "LMT", "LOW", "LRCX", "MA", "MCD", "MDB", "MELI", "META", "MRK", "MRVL", "MSFT", "MU", "NBIS", "NEE", "NET",
  "NFLX", "NKE", "NOW", "NVDA", "ON", "ORCL", "PANW", "PEP", "PFE", "PG", "PLTR", "PYPL", "QCOM", "RBLX", "RIVN", "SBUX",
  "SCHW", "SHOP", "SMCI", "SNDK", "SNOW", "SNPS", "SOFI", "SPOT", "STX", "T", "TGT", "TMO", "TMUS", "TSLA", "TSM", "TTWO",
  "TXN", "UBER", "UNH", "V", "VZ", "WDAY", "WDC", "WMT", "XOM", "ZS",
];

/**
 * Qué toca reevaluar: lo del universo que aún no está en la tabla y lo que lleva más de
 * `horas` sin actualizar, lo más viejo primero. `omitir` = lo que ya falló en este turno.
 */
export function pendientes(filas: { ticker: string; actualizado: string }[], universo: string[], omitir: string[], horas: number, ahora: number): string[] {
  const limite = ahora - horas * 3600_000;
  const fuera = new Set(omitir.map((t) => t.toUpperCase()));
  const enTabla = new Set(filas.map((f) => f.ticker));
  const nuevos = universo.filter((t) => !enTabla.has(t));
  const vencidos = filas
    .filter((f) => Date.parse(f.actualizado) < limite)
    .sort((a, b) => Date.parse(a.actualizado) - Date.parse(b.actualizado))
    .map((f) => f.ticker);
  return [...new Set([...nuevos, ...vencidos])].filter((t) => !fuera.has(t));
}
