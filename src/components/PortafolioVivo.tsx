"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import type { PosicionPublica } from "@/lib/providers/portafolioPublico";
import type { Rendimiento } from "@/app/api/rendimientos/route";
import { Card, Eyebrow, SignalPill } from "./ui";
import { diaNY, ganaHoy, type Op } from "@/lib/hoy";
import { ordenar } from "@/lib/orden";
import { BotonOrden, SelectOrden, useOrden } from "./Orden";
import { TickerLogo } from "./TickerLogo";
import { fmtMoney, fmtPct } from "@/lib/format";
import type { SignalKey, Quote } from "@/lib/analysis/types";

const OPC = [["valor", "Valor"], ["ticker", "Acción"], ["precio", "Precio"], ["hoy", "Hoy"], ["s1", "1 sem"], ["m1", "1 mes"], ["m6", "6 meses"], ["ganancia", "Ganancia"], ["senal", "Señal"]] as const;
type KPos = (typeof OPC)[number][0];
const PESO_SENAL: Record<string, number> = { strong: 5, good: 4, watch: 3, wait: 2, avoid: 1 };

const PERIODOS = [
  ["1D", "Hoy"],
  ["1S", "1 semana"],
  ["1M", "1 mes"],
  ["3M", "3 meses"],
  ["6M", "6 meses"],
  ["YTD", "En el año"],
] as const;
const tono = (v: number | null | undefined) => ((v ?? 0) >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)");
const signo = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : "-"}${fmtMoney(Math.abs(v))}`);
const cant = (v: number | null) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 4 }));
type Ret = { portafolio: number; indiceComun: number };

/** Cada minuto: el endpoint de rendimientos usa caché de 1-2 min, así que es "en vivo" con hasta 15 min de retraso de la fuente. */
function useCadaMinuto<T>(url: string | null, inicial: T): T {
  const [d, setD] = useState<T>(inicial);
  useEffect(() => {
    if (!url) return;
    let vivo = true;
    const cargar = () => fetch(url).then((r) => r.json()).then((j) => vivo && setD(j)).catch(() => {});
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [url]);
  return d;
}

/** Franja de rendimiento por periodo (TWR calculado con las órdenes; "Hoy" = misma cifra en vivo de arriba, sin efectivo) frente al S&P 500. */
export function RendimientoCuenta() {
  const { hoyInvertido } = useCuentaViva();
  const [ret, setRet] = useState<Record<string, Ret | null>>({});
  useEffect(() => {
    let vivo = true;
    const cargar = (r: string) =>
      fetch(`/api/portafolio?rango=${r}`)
        .then((x) => x.json())
        .then((j) => vivo && setRet((p) => ({ ...p, [r]: j.retorno ?? null })))
        .catch(() => {});
    PERIODOS.forEach(([r]) => cargar(r));
    const t = setInterval(() => PERIODOS.forEach(([r]) => cargar(r)), 60_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, []);
  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
      {PERIODOS.map(([r, l]) => {
        const x = ret[r];
        const v = r === "1D" ? (x && hoyInvertido != null ? { ...x, portafolio: hoyInvertido } : null) : x;
        const dif = v ? v.portafolio - v.indiceComun : null;
        return (
          <Card key={r} className="p-3">
            <p className="text-[0.62rem] uppercase tracking-wider text-ink-soft font-bold flex items-center gap-1.5">
              {r === "1D" && <span className="inline-block h-1.5 w-1.5 rounded-full bg-terracotta motion-safe:animate-pulse" />}
              {l}
            </p>
            {v ? (
              <>
                <p className="num font-display text-2xl leading-tight" style={{ color: tono(v.portafolio) }}>{fmtPct(v.portafolio, 2, true)}</p>
                <p className="num text-[0.68rem] text-ink-soft">
                  S&amp;P {fmtPct(v.indiceComun, 2, true)} · <b style={{ color: tono(dif) }}>{dif! >= 0 ? "+" : ""}{dif!.toFixed(2)} pp</b>
                </p>
              </>
            ) : (
              <span className="skeleton block h-8 w-20 mt-1" />
            )}
          </Card>
        );
      })}
    </div>
  );
}

/** Cotizaciones cada 15 s (Finnhub en tiempo real si hay llave; si no, Yahoo con hasta 15 min de retraso). */
function useCotizaciones(tickers: string[]) {
  const [q, setQ] = useState<Record<string, Quote | null>>({});
  const [asOf, setAsOf] = useState<number | null>(null);
  const [fallo, setFallo] = useState(false);
  const key = tickers.join(",");
  useEffect(() => {
    if (!key) return;
    let vivo = true;
    const cargar = () =>
      fetch(`/api/quote?symbols=${key}`)
        .then((r) => r.json())
        .then((j) => {
          if (!vivo) return;
          setQ(j.quotes ?? {});
          setFallo(false);
          setAsOf(j.asOf ?? Date.now());
        })
        .catch(() => vivo && setFallo(true));
    cargar();
    const t = setInterval(cargar, 15_000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [key]);
  return { q, asOf, fallo };
}

/**
 * La cuenta en vivo: cantidades y precio promedio de las órdenes cargadas × precio de mercado de este momento.
 */
type Cuenta = ReturnType<typeof useCuenta>;
const CuentaCtx = createContext<Cuenta | null>(null);
type Ventas = Record<string, { realizado: number; costo: number }>;

function useCuenta(pos: PosicionPublica[], ops: Op[], efectivo: number | null) {
  const tickers = pos.map((p) => p.ticker);
  const { q, asOf, fallo } = useCotizaciones(tickers);
  const rend = useCadaMinuto<Record<string, Rendimiento | null>>(pos.length ? `/api/rendimientos?symbols=${tickers.join(",")}` : null, {});
  const filas = pos.map((p) => {
    const r = rend[p.ticker];
    const qt = q[p.ticker];
    const precio = qt?.price ?? r?.precio ?? p.precio ?? 0;
    const cant = p.cantidad ?? 0;
    const valor = cant * precio;
    const ant = qt?.prevClose ?? (r?.hoy != null ? (r.precio ?? precio) / (1 + r.hoy / 100) : null);
    const hoy = qt?.changePct ?? (ant ? (precio / ant - 1) * 100 : null);
    const g = ant ? ganaHoy(cant, precio, ant, qt ? ops.filter((o) => o.ticker === p.ticker && o.fecha === diaNY(qt.asOf)) : []) : null;
    return { p, r, precio, valor, hoy, pnl: valor - cant * (p.precio_prom ?? 0), pnlDia: g?.gana ?? null, base: g?.base ?? 0 };
  });
  const suma = (f: (x: (typeof filas)[number]) => number) => filas.reduce((n, x) => n + f(x), 0);
  const total = suma((f) => f.valor), dia = suma((f) => f.pnlDia ?? 0), pnl = suma((f) => f.pnl), base = suma((f) => f.base);
  const cuenta = total + (efectivo ?? 0);
  return {
    filas, total, dia, pnl, cuenta, efectivo, asOf, fallo,
    /** Sin el efectivo: comparable con los demás periodos y con la gráfica. */
    hoyInvertido: asOf && base ? (dia / base) * 100 : null,
    /** Con el efectivo: como lo reporta IBKR. */
    hoyCuenta: asOf && cuenta - dia ? (dia / (cuenta - dia)) * 100 : null,
    // Con precios en vivo; si el servicio de precios falla se muestran los guardados y se avisa
    listo: asOf != null || fallo || !pos.length,
  };
}

/** Una sola fuente de precios en vivo para toda la página: así las cifras no se contradicen. */
export function CuentaViva({ pos, ops, efectivo, children }: { pos: PosicionPublica[]; ops: Op[]; efectivo: number | null; children: React.ReactNode }) {
  return <CuentaCtx.Provider value={useCuenta(pos, ops, efectivo)}>{children}</CuentaCtx.Provider>;
}
const useCuentaViva = () => useContext(CuentaCtx)!;

/** Ganancia en dólares del año en curso: ventas del año + lo abierto a precio de ahora. */
export function GananciaAnioVivo({ vendido }: { vendido: number }) {
  const { pnl, listo } = useCuentaViva();
  if (!listo) return <span className="skeleton block h-10 w-40 mt-1" />;
  const t = vendido + pnl;
  return (
    <>
      <p className="num text-sm mt-1">Ganancia: <b style={{ color: tono(t) }}>{signo(t)}</b></p>
      <p className="num text-xs text-ink-soft">En ventas del año {signo(vendido)} · en lo que tenemos {signo(pnl)}</p>
    </>
  );
}

export function PortafolioEnVivo({ senales, realizado, ventas = {} }: { senales: Record<string, { key: string; label: string } | undefined>; realizado: number; ventas?: Ventas }) {
  const { filas, total, dia, pnl, cuenta, efectivo, asOf, fallo, hoyInvertido, hoyCuenta, listo } = useCuentaViva();
  const ctl = useOrden<KPos>("valor", true, ["ticker"]);
  const vista = ordenar(filas, (f) => {
    switch (ctl.o.k) {
      case "ticker": return f.p.ticker;
      case "precio": return f.precio;
      case "hoy": return f.hoy;
      case "s1": case "m1": case "m6": return f.r?.[ctl.o.k];
      case "ganancia": return f.pnl + (ventas[f.p.ticker]?.realizado ?? 0);
      case "senal": return PESO_SENAL[senales[f.p.ticker]?.key ?? ""];
      default: return f.valor;
    }
  }, ctl.o.desc);
  const costo = total - pnl;
  // Rentabilidad con ventas: lo ganado en posiciones abiertas + lo ya realizado, sobre todo lo invertido (abierto + vendido)
  const costoVendido = Object.values(ventas).reduce((a, v) => a + v.costo, 0);
  const totalGan = pnl + realizado;
  const rentTotal = costo + costoVendido ? (totalGan / (costo + costoVendido)) * 100 : null;
  const kpis: Array<[string, string, string?, string?]> = [
    ["Valor de la cuenta", fmtMoney(cuenta), undefined, "posiciones + efectivo"],
    ["Hoy", signo(dia), tono(dia), efectivo != null ? `${fmtPct(hoyCuenta, 2, true)} con efectivo · ${fmtPct(hoyInvertido, 2, true)} sin efectivo` : fmtPct(hoyInvertido, 2, true)],
    ["Ganancia total", signo(totalGan), tono(totalGan), `${fmtPct(rentTotal, 1, true)} con ventas`],
    ["No realizada · realizada", `${signo(pnl)}`, tono(pnl), `${signo(realizado)} realizada en ventas`],
    ["Invertido en posiciones", fmtMoney(costo)],
    ["Efectivo", fmtMoney(efectivo)],
  ];
  const COLS = "grid-cols-[minmax(0,1fr)_5rem_5.5rem] lg:grid-cols-[minmax(0,1.2fr)_5rem_5.5rem_6rem_4.2rem_4.2rem_4.2rem_6.5rem_6rem]";
  const pct = (v: number | null | undefined) => <span className="num text-right text-xs font-semibold" style={{ color: tono(v) }}>{fmtPct(v, 1, true)}</span>;

  if (!listo) return <div className="skeleton w-full h-[36rem] rounded-2xl" role="status" aria-label="Cargando precios en vivo" />;
  return (
    <>
    <section className="space-y-2">
      <p className="text-xs text-ink-soft flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-terracotta motion-safe:animate-pulse" />
        {fallo && !asOf ? "Sin precios en vivo en este momento: se muestran los últimos guardados" : "Calculado en vivo · se actualiza cada 15 s"}{asOf ? ` · ${new Date(asOf).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {kpis.map(([k, v, c, sub]) => (
          <Card key={k} className="p-3 sm:p-4">
            <p className="text-[0.62rem] uppercase tracking-wider text-ink-soft font-bold">{k}</p>
            <p className="num font-display text-xl sm:text-2xl mt-1 leading-tight" style={c ? { color: c } : undefined}>{v}</p>
            {sub && <p className="num text-[0.7rem] mt-0.5" style={{ color: c ?? "var(--ink-soft)" }}>{sub}</p>}
          </Card>
        ))}
      </div>
    </section>
    <Torta filas={filas.map((f) => ({ ticker: f.p.ticker, valor: f.valor }))} efectivo={efectivo ?? 0} />
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <Eyebrow>Posiciones · en vivo</Eyebrow>
        <p className="text-xs text-ink-soft num">
          Valor <b className="text-ink">{fmtMoney(total)}</b> · hoy <b style={{ color: tono(dia) }}>{signo(dia)}</b> · ganancia total <b style={{ color: tono(totalGan) }}>{signo(totalGan)}</b> ({fmtPct(rentTotal, 1, true)}, incluye ventas)
        </p>
      </div>
      <SelectOrden ctl={ctl} opciones={OPC} className="mb-2 lg:hidden" />
      <Card className="p-0 overflow-hidden">
        <div className={`grid ${COLS} gap-x-3 px-4 py-2 text-[0.6rem] uppercase tracking-wider text-ink-soft border-b border-line`}>
          <span><BotonOrden ctl={ctl} k="ticker">Acción</BotonOrden></span>
          <span className="text-right"><BotonOrden ctl={ctl} k="precio">Precio</BotonOrden></span>
          <span className="text-right"><BotonOrden ctl={ctl} k="hoy">Hoy</BotonOrden></span>
          <span className="hidden lg:block text-right"><BotonOrden ctl={ctl} k="valor">Valor</BotonOrden></span>
          <span className="hidden lg:block text-right"><BotonOrden ctl={ctl} k="s1">1 sem</BotonOrden></span>
          <span className="hidden lg:block text-right"><BotonOrden ctl={ctl} k="m1">1 mes</BotonOrden></span>
          <span className="hidden lg:block text-right"><BotonOrden ctl={ctl} k="m6">6 meses</BotonOrden></span>
          <span className="hidden lg:block text-right"><BotonOrden ctl={ctl} k="ganancia">Ganancia</BotonOrden></span>
          <span className="hidden lg:block text-right"><BotonOrden ctl={ctl} k="senal">Señal</BotonOrden></span>
        </div>
        <ul className="divide-y divide-line">
          {vista.map(({ p, r, precio, valor, hoy, pnl, pnlDia }) => {
            const s = senales[p.ticker];
            return (
              <li key={p.ticker} className={`grid ${COLS} gap-x-3 items-center px-4 py-2 text-sm`}>
                <Link href={`/accion/${p.ticker}`} className="flex items-center gap-2 min-w-0 hover:text-terracotta">
                  <TickerLogo symbol={p.ticker} size={26} />
                  <span className="min-w-0">
                    <b>{p.ticker}</b> <span className="num text-xs text-ink-soft">{total ? ((valor / total) * 100).toFixed(1) : p.peso.toFixed(1)}%</span>
                    <span className="block text-[0.65rem] text-ink-soft num">{cant(p.cantidad)} × {fmtMoney(p.precio_prom)} prom.</span>
                  </span>
                </Link>
                <span className="num text-right">{fmtMoney(precio)}</span>
                <span className="num text-right font-bold leading-tight" style={{ color: tono(hoy) }}>
                  {fmtPct(hoy, 2, true)}
                  <span className="block text-[0.68rem] font-normal">{signo(pnlDia)}</span>
                </span>
                <span className="hidden lg:block num text-right font-bold">{fmtMoney(valor)}</span>
                <span className="hidden lg:block text-right">{pct(r?.s1)}</span>
                <span className="hidden lg:block text-right">{pct(r?.m1)}</span>
                <span className="hidden lg:block text-right">{pct(r?.m6)}</span>
                <span className="hidden lg:block num text-right font-bold leading-tight" style={{ color: tono(pnl) }}>
                  {(() => {
                    // Por acción: abierta + lo ya realizado al vender parte de ella, sobre el costo de ambas
                    const v = ventas[p.ticker];
                    const costoAbierto = (p.cantidad ?? 0) * (p.precio_prom ?? 0);
                    const g = pnl + (v?.realizado ?? 0);
                    const pct = costoAbierto + (v?.costo ?? 0) ? (g / (costoAbierto + (v?.costo ?? 0))) * 100 : null;
                    return (
                      <>
                        {signo(g)}
                        <span className="block text-[0.68rem]">{fmtPct(pct, 1, true)}{v ? " · incl. venta" : ""}</span>
                      </>
                    );
                  })()}
                </span>
                <span className="hidden lg:flex justify-end">{s ? <SignalPill k={s.key as SignalKey} label={s.label} /> : <span className="text-xs text-ink-soft">ETF</span>}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
    </>
  );
}

const PALETA = ["#c46d34", "#6b6e55", "#22211d", "#8c2f1b", "#a9a296", "#8b8d6f", "#d9a27a", "#565a43", "#64615a", "#e3c9a8", "#3a3831"];

/** Diagrama de torta (dona) del portafolio con los valores en vivo; efectivo como porción aparte. */
function Torta({ filas, efectivo }: { filas: Array<{ ticker: string; valor: number }>; efectivo: number }) {
  const datos = [...filas].sort((a, b) => b.valor - a.valor).concat(efectivo > 0 ? [{ ticker: "Efectivo", valor: efectivo }] : []);
  const total = datos.reduce((a, d) => a + d.valor, 0);
  const [hover, setHover] = useState<string | null>(null);
  const ctl = useOrden<"valor" | "ticker">("valor", true, ["ticker"]);
  if (!total) return null;
  const R = 90, r = 56, C = 100;
  let ang = -Math.PI / 2;
  const arcos = datos.map((d, i) => {
    const a0 = ang, a1 = ang + (d.valor / total) * Math.PI * 2;
    ang = a1;
    const p = (rad: number, a: number) => `${C + rad * Math.cos(a)},${C + rad * Math.sin(a)}`;
    const grande = a1 - a0 > Math.PI ? 1 : 0;
    return { ...d, color: d.ticker === "Efectivo" ? "#d9cbb3" : PALETA[i % PALETA.length], path: `M${p(R, a0)} A${R},${R} 0 ${grande} 1 ${p(R, a1)} L${p(r, a1)} A${r},${r} 0 ${grande} 0 ${p(r, a0)} Z` };
  });
  const foco = arcos.find((a) => a.ticker === hover) ?? arcos[0];
  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <Eyebrow>Cómo está repartido el portafolio</Eyebrow>
        <SelectOrden ctl={ctl} opciones={[["valor", "Peso"], ["ticker", "Acción"]]} />
      </div>
      <Card className="p-4 flex flex-col sm:flex-row items-center gap-6">
        <svg viewBox="0 0 200 200" className="w-52 h-52 shrink-0" role="img" aria-label="Distribución del portafolio por posición">
          {arcos.map((a) => (
            <path key={a.ticker} d={a.path} fill={a.color} stroke="var(--paper)" strokeWidth="1.5" opacity={hover && hover !== a.ticker ? 0.45 : 1} onMouseEnter={() => setHover(a.ticker)} onMouseLeave={() => setHover(null)} className="transition-opacity cursor-pointer" />
          ))}
          <text x="100" y="94" textAnchor="middle" fontSize="15" fontWeight="700" fill="var(--ink)">{foco.ticker}</text>
          <text x="100" y="114" textAnchor="middle" fontSize="13" fill="var(--ink-soft)">{((foco.valor / total) * 100).toFixed(1)}%</text>
        </svg>
        <ul className="grid grid-cols-2 gap-x-3 sm:gap-x-6 gap-y-1.5 text-sm w-full">
          {ordenar(arcos, (a) => a[ctl.o.k], ctl.o.desc).map((a) => (
            <li key={a.ticker} className="flex items-center gap-1 sm:gap-2 min-w-0" onMouseEnter={() => setHover(a.ticker)} onMouseLeave={() => setHover(null)}>
              <span className="h-3 w-3 rounded-sm shrink-0" style={{ background: a.color }} />
              <b className="w-12 sm:w-16 truncate">{a.ticker}</b>
              <span className="num text-ink-soft">{((a.valor / total) * 100).toFixed(1)}%</span>
              <span className="num text-xs text-ink-soft ml-auto">{fmtMoney(a.valor)}</span>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

/** % del año en curso con el mismo cálculo que "En el año" (TWR con las órdenes). */
export function PctAnioVivo({ respaldo }: { respaldo: number | null }) {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/portafolio?rango=YTD")
      .then((r) => r.json())
      .then((j) => setV(j.retorno?.portafolio ?? null))
      .catch(() => {});
  }, []);
  const x = v ?? respaldo;
  if (x == null) return null;
  return <p className="num font-display text-3xl leading-tight" style={{ color: x >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>{fmtPct(x, 2, true)}</p>;
}
