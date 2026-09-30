"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Eyebrow } from "./ui";
import { fmtPct, isNum } from "@/lib/format";
import { RANGOS, type Rango } from "@/lib/analysis/portafolio";
import { ema, bollinger } from "@/lib/indicadores";

interface Datos {
  rango: Rango;
  asOf: number;
  /** El portafolio es null antes de que existiera la cuenta (periodos de 1, 3 y 5 años) */
  puntos: Array<{ t: number; indice: number; portafolio: number | null }>;
  /** indice = S&P en todo el periodo · portafolio = desde que existe · indiceComun = S&P en ese tramo */
  retorno: { indice: number; portafolio: number; indiceComun: number };
  inicioPortafolio: number | null;
  /** Termina con el punto "ahora" (precios de este minuto) */
  enVivo: boolean;
  /** "ibkr" = rendimiento oficial de la cuenta; "estimado" = hoy, con los pesos por el precio actual */
  fuente: "ibkr" | "estimado";
  /** Último cierre que publicó IBKR (medianoche UTC) */
  hasta: number | null;
  pesos: Array<{ ticker: string; peso: number }>;
}

const ORDEN: Rango[] = ["1D", "1M", "3M", "6M", "YTD", "1A", "3A", "5A"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Fecha según el rango: hora de Nueva York en intradía; día y mes; mes y año si el periodo pasa del año. */
function fecha(t: number, rango: Rango, larga = false, anual = false) {
  if (rango === "1D") {
    const h = new Intl.DateTimeFormat("es-CO", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(t);
    return larga ? `${h} (hora de Nueva York)` : h;
  }
  const d = new Date(t);
  const dia = d.getUTCDate();
  const mes = MESES[d.getUTCMonth()];
  const anio = d.getUTCFullYear();
  if (larga) return `${dia} ${mes} ${anio}`;
  return anual ? `${mes} ${anio}` : `${dia} ${mes}`;
}

/** Ancho real del contenedor: el SVG se dibuja a su tamaño para que el texto no se deforme. */
function useAncho() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, w };
}

function Grafico({ d, showBB, showEma, ema200 }: { d: Datos; showBB: boolean; showEma: boolean; ema200: Array<{ t: number; e: number; i: number }> | null }) {
  const { ref, w } = useAncho();
  const [hover, setHover] = useState<number | null>(null);
  const H = w < 480 ? 220 : 280;
  const pad = { l: 44, r: 14, t: 14, b: 26 };
  const pts = d.puntos;
  // Indicadores sobre la línea del S&P 500 (base 100), en los períodos del gráfico; una EMA solo se dibuja si hay más puntos que su período.
  const cierres = pts.map((p) => p.indice);
  const bb = bollinger(cierres);
  // EMA 200 diaria: se calcula sobre 5 años de S&P (así existe en cualquier periodo) y se lleva a la base 100 de este rango.
  const emaSerie = (() => {
    if (!ema200?.length || d.rango === "1D" || !pts.length) return null;
    const en = (t: number) => {
      let r: (typeof ema200)[number] | null = null;
      for (const q of ema200) if (q.t <= t + 12 * 3600000) r = q;
      return r;
    };
    const base = en(pts[0].t);
    if (!base) return null;
    return pts.map((p) => {
      const q = en(p.t);
      return q ? (q.e * 100) / base.i : null;
    });
  })();
  const valores = pts.flatMap((p, i) => [...(p.portafolio === null ? [p.indice] : [p.indice, p.portafolio]), ...(showBB && bb[i] ? [bb[i]!.up, bb[i]!.dn] : []), ...(showEma && emaSerie?.[i] != null ? [emaSerie[i]!] : [])]);
  let min = Math.min(100, ...valores);
  let max = Math.max(100, ...valores);
  const margen = (max - min) * 0.08 || 1;
  min -= margen;
  max += margen;
  const x = (i: number) => pad.l + (i / Math.max(1, pts.length - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  // Cada tramo sin datos corta la línea: el portafolio arranca en su primer día, no en el del S&P.
  const linea = (k: "indice" | "portafolio") => {
    let d = "";
    let abierto = false;
    pts.forEach((p, i) => {
      const v = p[k];
      if (v === null) return void (abierto = false);
      d += `${abierto ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      abierto = true;
    });
    return d;
  };
  const serie = (vals: Array<number | null | undefined>) => vals.reduce<string>((d, v, i) => (v == null ? d : `${d}${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`), "");
  const bbIdx = bb.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  const bbBanda = bbIdx.length > 1 ? `${bbIdx.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(bb[i]!.up).toFixed(1)}`).join("")}${[...bbIdx].reverse().map((i) => `L${x(i).toFixed(1)},${y(bb[i]!.dn).toFixed(1)}`).join("")}Z` : "";
  const iInicio = d.inicioPortafolio !== null ? pts.findIndex((p) => p.portafolio !== null) : -1;

  // Marcas del eje en % redondos (base 100 = 0%)
  // En intradía el rango cabe en un punto porcentual: hacen falta pasos de 0.1 a 0.5.
  const paso = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10, 20, 25, 50, 100].find((s) => (max - min) / s <= 5) ?? 200;
  const marcas: number[] = [];
  // Contador entero: sumar 0.1 en bucle acumula error y salta marcas.
  for (let k = Math.ceil((min - 100) / paso); k * paso <= max - 100; k++) marcas.push(Number((k * paso).toFixed(2)));
  const etiquetasX = pts.length > 2 ? [0, Math.floor((pts.length - 1) / 2), pts.length - 1] : [0, pts.length - 1];

  const mover = (clientX: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || pts.length < 2) return;
    const i = Math.round(((clientX - r.left - pad.l) / (w - pad.l - pad.r)) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  };
  const h = hover !== null ? pts[hover] : null;
  const ult = pts[pts.length - 1];
  const anual = pts.length > 1 && ult.t - pts[0].t > 330 * 86400000;

  return (
    <div ref={ref} className="relative mt-4 select-none" style={{ height: H }}>
      {w > 0 && (
        <svg
          width={w}
          height={H}
          role="img"
          aria-label={`Portafolio Invirtiendoo ${fmtPct(d.retorno.portafolio, 1, true)} y S&P 500 ${fmtPct(d.retorno.indice, 1, true)} en ${RANGOS[d.rango].etiqueta}`}
          onPointerMove={(e) => mover(e.clientX)}
          onPointerDown={(e) => mover(e.clientX)}
          onPointerLeave={() => setHover(null)}
          style={{ touchAction: "pan-y" }}
        >
          {marcas.map((m) => (
            <g key={m}>
              <line x1={pad.l} x2={w - pad.r} y1={y(100 + m)} y2={y(100 + m)} stroke="var(--line-soft)" strokeDasharray={m === 0 ? "4 4" : undefined} />
              <text x={pad.l - 8} y={y(100 + m) + 4} textAnchor="end" fontSize="11" fill="var(--ink-soft)" className="num">
                {m > 0 ? "+" : ""}
                {m}%
              </text>
            </g>
          ))}
          {etiquetasX.map((i, k) => (
            <text key={i} x={x(i)} y={H - 6} fontSize="11" fill="var(--ink-soft)" textAnchor={k === 0 ? "start" : k === etiquetasX.length - 1 ? "end" : "middle"}>
              {fecha(pts[i].t, d.rango, false, anual)}
            </text>
          ))}
          {showBB && bbBanda && (
            <>
              <path d={bbBanda} fill="var(--terracotta)" opacity="0.09" />
              <path d={serie(bb.map((b) => b?.up))} fill="none" stroke="var(--terracotta)" strokeWidth="1" opacity="0.7" />
              <path d={serie(bb.map((b) => b?.dn))} fill="none" stroke="var(--terracotta)" strokeWidth="1" opacity="0.7" />
            </>
          )}
          {showEma && emaSerie && <path d={serie(emaSerie)} fill="none" stroke="var(--olive)" strokeWidth="2.5" strokeLinejoin="round" />}
          <path d={linea("indice")} fill="none" stroke="var(--ink-soft)" strokeWidth="2" strokeLinejoin="round" />
          <path d={linea("portafolio")} fill="none" stroke="var(--terracotta)" strokeWidth="3" strokeLinejoin="round" />
          <circle cx={x(pts.length - 1)} cy={y(ult.indice)} r="3.5" fill="var(--ink-soft)" />
          {ult.portafolio !== null && <circle cx={x(pts.length - 1)} cy={y(ult.portafolio)} r="4.5" fill="var(--terracotta)" />}
          {iInicio > 0 && (
            <g>
              <line x1={x(iInicio)} x2={x(iInicio)} y1={pad.t} y2={H - pad.b} stroke="var(--terracotta)" strokeOpacity="0.5" strokeDasharray="3 4" />
              <text x={x(iInicio) - 6} y={pad.t + 10} textAnchor="end" fontSize="11" fill="var(--terracotta)">
                Inicio del portafolio
              </text>
            </g>
          )}
          {h && hover !== null && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--ink)" strokeOpacity="0.25" />
              <circle cx={x(hover)} cy={y(h.indice)} r="4" fill="var(--paper)" stroke="var(--ink-soft)" strokeWidth="2" />
              {h.portafolio !== null && <circle cx={x(hover)} cy={y(h.portafolio)} r="4.5" fill="var(--paper)" stroke="var(--terracotta)" strokeWidth="2.5" />}
            </g>
          )}
        </svg>
      )}
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-1 rounded-xl border border-line bg-paper px-3 py-2 text-xs shadow-md"
          style={{ left: Math.min(Math.max(x(hover) - 90, 0), Math.max(0, w - 180)), width: 180 }}
        >
          <p className="text-ink-soft">{fecha(h.t, d.rango, true)}</p>
          <p className="mt-1 flex justify-between gap-2">
            <span className="font-bold text-terracotta">Portafolio</span>
            <span className="num font-bold">{h.portafolio === null ? "aún no existía" : fmtPct(h.portafolio - 100, 1, true)}</span>
          </p>
          <p className="flex justify-between gap-2">
            <span>S&amp;P 500</span>
            <span className="num">{fmtPct(h.indice - 100, 1, true)}</span>
          </p>
        </div>
      )}
    </div>
  );
}

/** Portada: el Portafolio Invirtiendoo contra el S&P 500, en vivo y en varios periodos. */
export function PortafolioVsSP() {
  const [rango, setRango] = useState<Rango>("YTD");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [showBB, setShowBB] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const [ema200, setEma200] = useState<Array<{ t: number; e: number; i: number }> | null>(null);
  useEffect(() => {
    fetch("/api/portafolio?rango=5A")
      .then((r) => r.json())
      .then((j: Datos) => {
        const v = j.puntos.map((p) => p.indice);
        const e = ema(v, 200);
        setEma200(j.puntos.map((p, k) => ({ t: p.t, e: e[k], i: v[k] })));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let vivo = true;
    const cargar = () =>
      fetch(`/api/portafolio?rango=${rango}`)
        .then((r) => r.json())
        .then((j) => {
          if (!vivo) return;
          if (j.error) setError(j.error);
          else {
            setDatos(j);
            setError(null);
          }
        })
        .catch(() => vivo && setError("Sin conexión con el mercado"))
        .finally(() => vivo && setCargando(false));
    setCargando(true);
    cargar();
    // Todos los periodos terminan en el precio de este minuto: se refrescan cada minuto.
    const iv = setInterval(cargar, 60_000);
    return () => {
      vivo = false;
      clearInterval(iv);
    };
  }, [rango]);

  // Al cambiar de periodo se deja el anterior atenuado hasta que llegan los datos nuevos.
  const d = datos;
  const atenuado = cargando || (d !== null && d.rango !== rango);
  // Solo se compara el tramo en que existían los dos
  const dif = d ? d.retorno.portafolio - d.retorno.indiceComun : null;
  const desde = d?.inicioPortafolio ? fecha(d.inicioPortafolio, "1M", true).replace(/^\d+ /, "") : null;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Eyebrow>Portafolio Invirtiendoo vs S&amp;P 500</Eyebrow>
          {d?.enVivo && (
            <p className="mt-1 inline-flex items-center gap-2 text-xs text-ink-soft">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-terracotta opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-terracotta" />
              </span>
              En vivo · se actualiza cada minuto{d.fuente === "ibkr" && d.hasta ? ` · oficial de IBKR al cierre del ${fecha(d.hasta, "1M", true)}, lo de hoy estimado` : " · estimado con las posiciones de IBKR"}
            </p>
          )}
        </div>
        <div role="group" aria-label="Periodo" className="grid w-full grid-cols-8 gap-1 sm:flex sm:w-auto sm:gap-1.5">
          {ORDEN.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={rango === r}
              onClick={() => setRango(r)}
              className={`min-h-9 rounded-full px-0 text-[0.8rem] font-bold transition-colors sm:min-w-11 sm:px-3 sm:text-sm ${rango === r ? "bg-ink text-cream" : "border border-line text-ink hover:border-terracotta hover:text-terracotta"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className={`mt-4 flex flex-wrap items-end gap-x-8 gap-y-2 transition-opacity ${atenuado && d ? "opacity-60" : ""}`}>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-terracotta">Portafolio Invirtiendoo{desde ? ` · desde ${desde}` : ""}</p>
          <p className="num font-display text-4xl leading-none text-terracotta">{d ? fmtPct(d.retorno.portafolio, 1, true) : "—"}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">S&amp;P 500{d?.inicioPortafolio ? ` · ${RANGOS[d.rango].etiqueta}` : ""}</p>
          <p className="num font-display text-4xl leading-none">{d ? fmtPct(d.retorno.indice, 1, true) : "—"}</p>
        </div>
        {isNum(dif) && (
          <p className="pb-1 text-sm text-ink-soft">
            <b className="num" style={{ color: dif >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>
              {Math.abs(dif).toFixed(1)} pp
            </b>{" "}
            {dif >= 0 ? "por encima" : "por debajo"} del índice · {desde ? `en el mismo tramo, desde ${desde} (S&P ${fmtPct(d!.retorno.indiceComun, 1, true)})` : RANGOS[d!.rango].etiqueta.toLowerCase()}
          </p>
        )}
      </div>

      {d ? (
        <div className={`transition-opacity ${atenuado ? "opacity-60" : ""}`} aria-busy={atenuado}>
          <Grafico d={d} showBB={showBB} showEma={showEma} ema200={ema200} />
        </div>
      ) : error ? (
        <div className="mt-4 flex h-[220px] items-center justify-center rounded-xl bg-cream-2/60 text-sm text-ink-soft sm:h-[280px]">No pude leer el mercado: {error}</div>
      ) : (
        <div className="skeleton mt-4 h-[220px] w-full sm:h-[280px]" aria-busy="true" aria-label="Cargando gráfico" />
      )}

      {d && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.7rem] font-bold">
            <span className="font-normal text-ink-soft">Sobre el S&amp;P 500:</span>
            <button type="button" aria-pressed={showBB} onClick={() => setShowBB(!showBB)} className={`rounded-full border px-2 py-0.5 ${showBB ? "border-terracotta" : "border-line text-ink-soft"}`}>
              Bollinger (20, 2)
            </button>
            <button type="button" aria-pressed={showEma} onClick={() => setShowEma(!showEma)} className={`rounded-full border px-2 py-0.5 ${showEma ? "border-ink" : "border-line text-ink-soft"}`}>
              <span className="mr-1 inline-block h-0.5 w-3 align-middle" style={{ background: "var(--olive)" }} />EMA 200
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {d.pesos.map((p) => (
              <span key={p.ticker} className="pill border border-line text-ink">
                {p.ticker} <span className="num font-medium text-ink-soft">{p.peso.toFixed(p.peso < 10 ? 1 : 0)}%</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            Cuenta real de Invirtiendoo en Interactive Brokers, empezó en diciembre de 2025: en 1, 3 y 5 años el S&amp;P se ve completo y el portafolio arranca ese día, pegado a su línea. Rendimiento ponderado por tiempo (TWR): los aportes nuevos no cuentan como ganancia. Incluye dividendos; el S&amp;P 500 es el índice de precio, sin dividendos. &quot;Hoy&quot; es un estimado en vivo con los pesos del último cierre; los demás periodos son el dato oficial de IBKR. Rendimientos pasados no aseguran resultados futuros.
          </p>
        </>
      )}
    </Card>
  );
}
