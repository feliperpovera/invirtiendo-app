import type { PricePoint } from "@/lib/analysis/types";
import { ema } from "./indicadores";

/* ── Velas japonesas ─────────────────────────────────────────────── */

export type TipoVela = "alcista" | "bajista" | "neutral";
export type Patron = { i: number; t: number; nombre: string; tipo: TipoVela; velas: number; volumen: boolean };

/** Qué significa cada patrón, en una línea (para la leyenda y los tooltips). */
export const PATRONES: Record<string, string> = {
  Martillo: "Mecha inferior larga tras una caída: los compradores rechazaron precios más bajos.",
  "Martillo invertido": "Mecha superior larga tras una caída: primer intento de los compradores, pide confirmación.",
  "Hombre colgado": "Forma de martillo tras una subida: aparecen vendedores dentro del día.",
  "Estrella fugaz": "Mecha superior larga tras una subida: el precio subió y fue rechazado.",
  "Envolvente alcista": "Una vela verde cubre por completo el cuerpo rojo anterior: los compradores toman el control.",
  "Envolvente bajista": "Una vela roja cubre por completo el cuerpo verde anterior: los vendedores toman el control.",
  "Estrella de la mañana": "Caída, vela pequeña de duda y vela verde fuerte: posible giro al alza.",
  "Estrella de la tarde": "Subida, vela pequeña de duda y vela roja fuerte: posible giro a la baja.",
  "Tres soldados blancos": "Tres velas verdes seguidas con cierres más altos: compra sostenida.",
  "Tres cuervos negros": "Tres velas rojas seguidas con cierres más bajos: venta sostenida.",
  Doji: "Apertura y cierre casi iguales: indecisión; importa más después de una tendencia larga.",
};

const vela = (p: PricePoint) => {
  const o = p.o!, h = p.h!, l = p.l!, c = p.c;
  const rango = h - l || 1e-9;
  const cuerpo = Math.abs(c - o);
  return { o, h, l, c, rango, cuerpo, sup: h - Math.max(o, c), inf: Math.min(o, c) - l, verde: c > o, roja: c < o };
};
const tieneVela = (p?: PricePoint) => !!p && p.o != null && p.h != null && p.l != null;

/** Detecta los patrones clásicos en cada barra. La tendencia previa (10 barras) decide si un martillo es martillo o hombre colgado. */
export function detectarPatrones(pts: PricePoint[]): Patron[] {
  const out: Patron[] = [];
  for (let i = 11; i < pts.length; i++) {
    if (!tieneVela(pts[i]) || !tieneVela(pts[i - 1]) || !tieneVela(pts[i - 2])) continue;
    const a = vela(pts[i - 2]), b = vela(pts[i - 1]), x = vela(pts[i]);
    const prev = pts[i - 1].c / pts[i - 11].c - 1;
    const baja = prev < -0.03, sube = prev > 0.03;
    const vols = pts.slice(Math.max(0, i - 20), i).map((p) => p.v ?? 0);
    const volMedio = vols.reduce((s, v) => s + v, 0) / (vols.length || 1);
    const volumen = !!pts[i].v && volMedio > 0 && pts[i].v! > volMedio * 1.2;
    const add = (nombre: string, tipo: TipoVela, velas: number) => out.push({ i, t: pts[i].t, nombre, tipo, velas, volumen });

    // 3 velas primero: si hay una estrella o tres soldados, no se reporta además la vela suelta
    if (baja && a.roja && a.cuerpo > a.rango * 0.5 && b.cuerpo < a.cuerpo * 0.4 && x.verde && x.c > a.c + a.cuerpo / 2) { add("Estrella de la mañana", "alcista", 3); continue; }
    if (sube && a.verde && a.cuerpo > a.rango * 0.5 && b.cuerpo < a.cuerpo * 0.4 && x.roja && x.c < a.c - a.cuerpo / 2) { add("Estrella de la tarde", "bajista", 3); continue; }
    const fuerte = (v: ReturnType<typeof vela>) => v.cuerpo > v.rango * 0.5;
    if ([a, b, x].every((v) => v.verde && fuerte(v)) && b.c > a.c && x.c > b.c && b.o > a.o && x.o > b.o) { add("Tres soldados blancos", "alcista", 3); continue; }
    if ([a, b, x].every((v) => v.roja && fuerte(v)) && b.c < a.c && x.c < b.c && b.o < a.o && x.o < b.o) { add("Tres cuervos negros", "bajista", 3); continue; }

    if (baja && b.roja && x.verde && x.o <= b.c && x.c >= b.o && x.cuerpo > b.cuerpo) { add("Envolvente alcista", "alcista", 2); continue; }
    if (sube && b.verde && x.roja && x.o >= b.c && x.c <= b.o && x.cuerpo > b.cuerpo) { add("Envolvente bajista", "bajista", 2); continue; }

    const mechaAbajo = x.cuerpo > 0 && x.inf >= 2 * x.cuerpo && x.sup <= Math.max(x.cuerpo * 0.5, x.rango * 0.1);
    const mechaArriba = x.cuerpo > 0 && x.sup >= 2 * x.cuerpo && x.inf <= Math.max(x.cuerpo * 0.5, x.rango * 0.1);
    if (mechaAbajo && baja) { add("Martillo", "alcista", 1); continue; }
    if (mechaAbajo && sube) { add("Hombre colgado", "bajista", 1); continue; }
    if (mechaArriba && sube) { add("Estrella fugaz", "bajista", 1); continue; }
    if (mechaArriba && baja) { add("Martillo invertido", "alcista", 1); continue; }
    if (x.cuerpo <= x.rango * 0.08 && (baja || sube)) add("Doji", "neutral", 1);
  }
  return out;
}

/* ── Termómetro técnico ──────────────────────────────────────────── */

export type Componente = { clave: string; nombre: string; peso: number; score: number | null; valor: string; lectura: string };
export type Termometro = { score: number | null; zona: { nombre: string; color: string; accion: string }; componentes: Componente[]; patrones: Patron[] };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const media = (a: number[]) => a.reduce((s, v) => s + v, 0) / (a.length || 1);
const pct = (v: number, d = 0) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const usd = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(1)} B` : v >= 1e6 ? `$${(v / 1e6).toFixed(0)} M` : `$${(v / 1e3).toFixed(0)} mil`);

export const ZONAS = [
  { min: 70, nombre: "Buen momento técnico", color: "var(--sig-strong)", accion: "La tendencia acompaña: si pasa los filtros, se puede entrar con el tramo completo." },
  { min: 55, nombre: "Neutral", color: "var(--olive)", accion: "Señales mixtas: entrar por tramos, no todo de una vez." },
  { min: 35, nombre: "Precaución", color: "var(--sig-watch)", accion: "Tendencia débil: tramo pequeño y solo con margen de seguridad amplio." },
  { min: 0, nombre: "Esperar", color: "var(--sig-avoid)", accion: "Precio en contra: esperar a que gire, salvo que el margen de seguridad sea muy alto." },
];

/**
 * Termómetro 0–100 del momento de compra con la serie diaria (~2 años). Pesos según la evidencia:
 * momentum 12-1 (Jegadeesh-Titman), cercanía al máximo de 52 semanas (George-Hwang), tendencia vs SMA 200 (Faber) y EMA 100,
 * liquidez y presión de volumen, volatilidad (Barroso-Santa-Clara) y velas recientes (evidencia débil: peso bajo).
 */
export function termometro(d: PricePoint[]): Termometro {
  const c = d.map((p) => p.c);
  const n = c.length;
  const P = c[n - 1];
  const comp: Componente[] = [];

  // 1. Momentum 12-1: de hace 12 meses a hace 1 mes
  if (n >= 253) {
    const m = c[n - 22] / c[n - 253] - 1;
    comp.push({ clave: "mom", nombre: "Momentum 12-1 meses", peso: 25, score: clamp01((m + 0.2) / 0.6), valor: pct(m), lectura: m > 0.15 ? "Fuerte: de las que vienen ganando" : m > 0 ? "Positivo" : "Negativo: viene perdiendo" });
  } else comp.push({ clave: "mom", nombre: "Momentum 12-1 meses", peso: 25, score: null, valor: "—", lectura: "Menos de 1 año de historia" });

  // 2. Cercanía al máximo de 52 semanas
  const max52 = Math.max(...d.slice(-252).map((p) => p.h ?? p.c));
  const cerca = P / max52;
  comp.push({ clave: "max52", nombre: "Cercanía al máximo 52 sem.", peso: 20, score: clamp01((cerca - 0.7) / 0.3), valor: `${(cerca * 100).toFixed(0)}%`, lectura: cerca >= 0.9 ? "Cerca del máximo: señal fuerte" : cerca >= 0.75 ? "Intermedia" : `A ${pct(cerca - 1)} del máximo` });

  // 3. Tendencia: precio vs SMA 200 y su pendiente (20 sesiones); muy estirada resta
  if (n >= 220) {
    const sma = (k: number) => media(c.slice(k - 200, k));
    const s = sma(n), s20 = sma(n - 20);
    const dist = P / s - 1;
    const subiendo = s > s20;
    let sc = clamp01((dist + 0.1) / 0.2) * 0.7 + (subiendo ? 0.3 : 0);
    if (dist > 0.3) sc = Math.min(sc, 0.6);
    comp.push({ clave: "sma", nombre: "Tendencia vs SMA 200", peso: 15, score: sc, valor: pct(dist, 1), lectura: dist > 0.3 ? "Muy estirada sobre la media: mejor esperar un retroceso" : `${dist >= 0 ? "Sobre" : "Bajo"} la media, que va ${subiendo ? "subiendo" : "bajando"}` });
  } else comp.push({ clave: "sma", nombre: "Tendencia vs SMA 200", peso: 15, score: null, valor: "—", lectura: "Falta historia" });

  // 3b. Tendencia de mediano plazo: precio vs EMA 100 y su pendiente (10 sesiones)
  if (n >= 120) {
    const e = ema(c, 100);
    const dist = P / e[n - 1] - 1;
    const subiendo = e[n - 1] > e[n - 11];
    comp.push({ clave: "ema100", nombre: "Tendencia vs EMA 100", peso: 10, score: clamp01((dist + 0.08) / 0.16) * 0.7 + (subiendo ? 0.3 : 0), valor: pct(dist, 1), lectura: `${dist >= 0 ? "Sobre" : "Bajo"} la media, que va ${subiendo ? "subiendo" : "bajando"}` });
  } else comp.push({ clave: "ema100", nombre: "Tendencia vs EMA 100", peso: 10, score: null, valor: "—", lectura: "Falta historia" });

  // 4. Liquidez y volumen: dinero negociado al día (20 sesiones) y volumen en días verdes vs rojos (50 sesiones)
  const conVol = d.slice(-50).filter((p) => p.v);
  if (conVol.length >= 20) {
    const adv = media(d.slice(-20).map((p) => p.c * (p.v ?? 0)));
    let up = 0, dn = 0;
    d.slice(-51).forEach((p, i, a) => {
      if (!i || !p.v) return;
      if (p.c >= a[i - 1].c) up += p.v;
      else dn += p.v;
    });
    const ratio = up / (dn || 1);
    const scAdv = adv >= 500e6 ? 1 : adv >= 50e6 ? 0.8 : adv >= 5e6 ? 0.5 : 0.2;
    comp.push({ clave: "liq", nombre: "Liquidez y volumen", peso: 15, score: scAdv * 0.4 + clamp01((ratio - 0.7) / 0.6) * 0.6, valor: `${usd(adv)}/día · ${ratio.toFixed(2)}x`, lectura: `${ratio >= 1.2 ? "Acumulación: más volumen en días de subida" : ratio <= 0.8 ? "Distribución: más volumen en días de caída" : "Volumen equilibrado"}${adv < 5e6 ? " · poca liquidez, ojo al entrar y salir" : ""}` });
  } else comp.push({ clave: "liq", nombre: "Liquidez y volumen", peso: 15, score: null, valor: "—", lectura: "Sin datos de volumen" });

  // 5. Volatilidad: la de 60 días frente a su propia historia (percentil); alta = tramo más pequeño
  const ret = c.slice(1).map((v, i) => Math.log(v / c[i]));
  if (ret.length >= 120) {
    const vol = (k: number) => { const w = ret.slice(k - 60, k); const m = media(w); return Math.sqrt(media(w.map((r) => (r - m) ** 2)) * 252); };
    const hoy = vol(ret.length);
    const hist: number[] = [];
    for (let k = 60; k <= ret.length; k += 5) hist.push(vol(k));
    const pctl = hist.filter((v) => v <= hoy).length / hist.length;
    comp.push({ clave: "vol", nombre: "Volatilidad 60 días", peso: 10, score: 1 - pctl, valor: `${(hoy * 100).toFixed(0)}% anual`, lectura: pctl >= 0.8 ? "Alta para esta acción: tramo a la mitad" : pctl <= 0.3 ? "Baja para esta acción" : "Normal para esta acción" });
  } else comp.push({ clave: "vol", nombre: "Volatilidad 60 días", peso: 10, score: null, valor: "—", lectura: "Falta historia" });

  // 6. Velas de las últimas 5 sesiones; con volumen alto pesan más
  const patrones = detectarPatrones(d);
  const recientes = patrones.filter((p) => p.i >= n - 5 && p.tipo !== "neutral");
  let scVela = 0.5;
  for (const p of recientes) scVela += (p.tipo === "alcista" ? 1 : -1) * (p.volumen ? 0.35 : 0.2);
  comp.push({ clave: "velas", nombre: "Velas recientes (5 sesiones)", peso: 5, score: tieneVela(d[n - 1]) ? clamp01(scVela) : null, valor: recientes.length ? recientes.map((p) => p.nombre).join(", ") : "Sin patrón", lectura: recientes.length ? (scVela > 0.5 ? "Giro o empuje al alza" : scVela < 0.5 ? "Señal de debilidad" : "Señales cruzadas") : "Nada relevante" });

  const validos = comp.filter((x) => x.score != null);
  const pesoTotal = validos.reduce((s, x) => s + x.peso, 0);
  const score = pesoTotal >= 50 ? Math.round((validos.reduce((s, x) => s + x.score! * x.peso, 0) / pesoTotal) * 100) : null;
  return { score, zona: ZONAS.find((z) => (score ?? 0) >= z.min)!, componentes: comp, patrones };
}
