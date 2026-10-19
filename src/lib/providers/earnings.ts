import { cached } from "./cache";

/** Calendario de resultados de Nasdaq.com (sin llave): un llamado por día hábil, cacheado 6 h. */
export interface Resultado { fecha: string; ticker: string; nombre: string; hora: "antes" | "despues" | "nd"; epsEstimado: number | null; analistas: number | null; marketCap: number | null }

type Fila = { symbol: string; name: string; time?: string; epsForecast?: string; noOfEsts?: string; marketCap?: string };
const num = (s?: string) => {
  const v = Number((s ?? "").replace(/[$,()]/g, ""));
  return s && Number.isFinite(v) && /\d/.test(s) ? (s.includes("(") ? -v : v) : null;
};

async function dia(fecha: string): Promise<Resultado[]> {
  return cached(`earn:v1:${fecha}`, 6 * 3600 * 1000, async () => {
    const r = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${fecha}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0", Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { data?: { rows?: Fila[] | null } };
    return (j.data?.rows ?? []).map((f) => ({
      fecha,
      ticker: f.symbol.trim().replace("/", "-"),
      nombre: f.name.trim(),
      hora: f.time === "time-pre-market" ? "antes" : f.time === "time-after-hours" ? "despues" : "nd",
      epsEstimado: num(f.epsForecast),
      analistas: num(f.noOfEsts),
      marketCap: num(f.marketCap),
    }));
  });
}

/** Próximos `dias` hábiles (zona de Nueva York). */
export async function proximosResultados(dias = 15): Promise<Resultado[]> {
  const fechas: string[] = [];
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  while (fechas.length < dias) {
    if (d.getDay() % 6) fechas.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return (await Promise.all(fechas.map((f) => dia(f).catch(() => [])))).flat();
}
