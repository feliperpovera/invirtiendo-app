import { cached } from "./cache";

/**
 * Calendario de resultados de Nasdaq.com (sin llave): un llamado por día hábil.
 * Días futuros se cachean 6 h (cambian las horas y estimados); días pasados 24 h (ya traen el EPS real y la sorpresa).
 */
export interface Resultado {
  fecha: string;
  ticker: string;
  nombre: string;
  hora: "antes" | "despues" | "nd";
  epsEstimado: number | null;
  epsReal: number | null;
  sorpresa: number | null; // % frente al consenso
  epsAnioPasado: number | null;
  trimestre: string | null;
  analistas: number | null;
  marketCap: number | null;
}

type Fila = { symbol: string; name: string; time?: string; epsForecast?: string; eps?: string; surprise?: string; lastYearEPS?: string; fiscalQuarterEnding?: string; noOfEsts?: string; marketCap?: string };
const num = (s?: string) => {
  const v = Number((s ?? "").replace(/[$,()]/g, ""));
  return s && Number.isFinite(v) && /\d/.test(s) ? (s.includes("(") ? -v : v) : null;
};
const hoyNY = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function dia(fecha: string): Promise<Resultado[]> {
  return cached(`earn:v2:${fecha}`, (fecha < hoyNY() ? 24 : 6) * 3600 * 1000, async () => {
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
      epsReal: num(f.eps),
      sorpresa: num(f.surprise),
      epsAnioPasado: num(f.lastYearEPS),
      trimestre: f.fiscalQuarterEnding ?? null,
      analistas: num(f.noOfEsts),
      marketCap: num(f.marketCap),
    }));
  });
}

/** Días hábiles entre dos fechas (YYYY-MM-DD, inclusive). */
export function diasHabiles(desde: string, hasta: string): string[] {
  const out: string[] = [];
  const d = new Date(`${desde}T12:00:00Z`), fin = new Date(`${hasta}T12:00:00Z`);
  while (d <= fin && out.length < 400) {
    if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Resultados de un rango de fechas, de a 8 llamados en paralelo. */
export async function resultadosRango(desde: string, hasta: string): Promise<Resultado[]> {
  const fechas = diasHabiles(desde, hasta);
  const out: Resultado[] = [];
  for (let i = 0; i < fechas.length; i += 8) out.push(...(await Promise.all(fechas.slice(i, i + 8).map((f) => dia(f).catch(() => [])))).flat());
  return out;
}

/** Próximos `dias` hábiles (zona de Nueva York). */
export async function proximosResultados(dias = 15): Promise<Resultado[]> {
  const hoy = hoyNY();
  const fin = new Date(`${hoy}T12:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + Math.ceil(dias * 1.5));
  return (await resultadosRango(hoy, fin.toISOString().slice(0, 10))).filter((_, i, a) => a.length > 0);
}
