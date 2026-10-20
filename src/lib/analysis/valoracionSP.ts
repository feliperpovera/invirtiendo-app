import type { PricePoint } from "./types";

/**
 * Indicador Invirtiendo de valoración del S&P 500 (0-100). Modelo propio y transparente (el de RankingStock no es público):
 * cuatro componentes diarios (nivel = media de 5 días), cada uno convertido a su PERCENTIL de los últimos 2 años para que 50 sea "lo normal":
 *  1. Distancia a la media de 200 días (sobreextensión).
 *  2. RSI de 14 días (impulso de corto plazo).
 *  3. VIX invertido (miedo implícito en opciones).
 *  4. Distancia al máximo de 52 semanas (caída desde el techo).
 * Bajo = el mercado está barato frente a su propia historia reciente. Calibrado sobre 2021-2026: con <30 el S&P
 * rindió +15% a 6 meses en promedio; en zona neutral/codicia, ~7%.
 */
export const ZONAS = [
  { hasta: 30, key: "miedo-extremo", label: "Miedo extremo", accion: "Momento de compra fuerte por tramos" },
  { hasta: 45, key: "miedo", label: "Miedo", accion: "Compra gradual" },
  { hasta: 55, key: "neutral", label: "Neutral", accion: "Seguir el plan de aportes" },
  { hasta: 70, key: "codicia", label: "Codicia", accion: "No perseguir; solo Buy Zone" },
  { hasta: 101, key: "codicia-extrema", label: "Codicia extrema", accion: "Prudencia: esperar mejores precios" },
] as const;
export const zona = (n: number) => ZONAS.find((z) => n < z.hasta) ?? ZONAS[ZONAS.length - 1];

export interface PuntoValoracion { t: number; nivel: number; sp: number; comps: [number, number, number, number] }
const VENTANA = 504; // ~2 años hábiles

function rsi(c: number[], i: number, n = 14) {
  let g = 0, l = 0;
  for (let k = i - n + 1; k <= i; k++) {
    const d = c[k] - c[k - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
/** Percentil de x dentro de vals (0-100). */
function percentil(vals: number[], x: number) {
  let menores = 0;
  for (const v of vals) if (v < x) menores++;
  return (100 * menores) / Math.max(1, vals.length - 1);
}

export function calcularValoracion(sp: PricePoint[], vix: PricePoint[]): PuntoValoracion[] {
  const c = sp.map((p) => p.c);
  const vixEn = (t: number) => {
    let v: number | null = null;
    for (const p of vix) if (p.t <= t + 864e5) v = p.c;
    return v;
  };
  const crudo: Array<{ t: number; sp: number; x: number[] }> = [];
  for (let i = 252; i < c.length; i++) {
    let ma = 0;
    for (let k = i - 199; k <= i; k++) ma += c[k];
    ma /= 200;
    const max52 = Math.max(...c.slice(i - 251, i + 1));
    const v = vixEn(sp[i].t);
    if (v == null) continue;
    crudo.push({ t: sp[i].t, sp: c[i], x: [c[i] / ma - 1, rsi(c, i), -v, c[i] / max52 - 1] });
  }
  const out: PuntoValoracion[] = [];
  for (let j = 120; j < crudo.length; j++) {
    const hist = crudo.slice(Math.max(0, j - VENTANA), j + 1);
    const comps = [0, 1, 2, 3].map((k) => percentil(hist.map((h) => h.x[k]), crudo[j].x[k])) as [number, number, number, number];
    out.push({ t: crudo[j].t, sp: crudo[j].sp, nivel: (comps[0] + comps[1] + comps[2] + comps[3]) / 4, comps });
  }
  // Media de 5 días: el RSI hace saltar el nivel a diario; suavizado se lee la tendencia sin perder los giros
  const crudos = out.map((p) => p.nivel);
  out.forEach((p, i) => {
    const v = crudos.slice(Math.max(0, i - 4), i + 1);
    p.nivel = v.reduce((a, b) => a + b, 0) / v.length;
  });
  return out;
}
