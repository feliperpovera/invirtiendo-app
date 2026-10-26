"use client";

import { useEffect, useState } from "react";
import type { Instrumento } from "@/lib/providers/mercados";
import { fmtPct } from "@/lib/format";
import { EVENTO_INDICE, type IndiceElegido } from "./PortafolioVsSP";

const BANDERA: Record<string, string> = { "^GSPC": "🇺🇸", "^NDX": "🇺🇸", "^DJI": "🇺🇸", "^RUT": "🇺🇸" };

/** Índices más importantes del mundo en la portada (EE. UU. + Europa, Asia y Latinoamérica), refrescados cada minuto. */
export function IndicesMundo() {
  const [m, setM] = useState<Instrumento[]>([]);
  const [activo, setActivo] = useState("^GSPC");
  // Clic = cambia el índice del gráfico de la portada en el mismo sitio (sin ir a otra página)
  const elegir = (x: Instrumento) => {
    const detail: IndiceElegido = { symbol: x.symbol, nombre: x.nombre.replace(/ \(.+\)/, "") };
    setActivo(x.symbol);
    window.dispatchEvent(new CustomEvent(EVENTO_INDICE, { detail }));
    document.getElementById("grafica-inicio")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  useEffect(() => {
    const cargar = () => fetch("/api/mercados?ligero=1").then((r) => r.json()).then(setM).catch(() => {});
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, []);
  const lista = m.filter((x) => (x.grupo === "Índices" && x.symbol !== "^VIX") || x.grupo === "Mundo");
  if (!lista.length) return <div className="skeleton h-20 w-full" />;
  return (
    <section aria-label="Índices del mundo">
      <div className="flex items-baseline justify-between mb-2">
        <p className="eyebrow">Índices del mundo · toca uno para ver su termómetro</p>
        <a href="/mercados" className="text-xs underline text-ink-soft">Ver mercados</a>
      </div>
      <div className="scroll-x -mx-1 px-1">
        <div className="flex gap-2 pb-1">
          {lista.map((x) => (
            <button key={x.symbol} type="button" onClick={() => elegir(x)} aria-pressed={activo === x.symbol} className={`card shrink-0 w-[9.5rem] p-2.5 text-left hover:border-terracotta transition-colors ${activo === x.symbol ? "!border-terracotta ring-2 ring-terracotta/40" : ""}`}>
              <p className="text-[0.68rem] text-ink-soft truncate">
                <span aria-hidden>{x.pais ?? BANDERA[x.symbol] ?? ""}</span> {x.nombre.replace(/ \(.+\)/, "")}
              </p>
              <p className="num font-bold text-sm">{x.precio.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
              <p className="num text-xs font-bold" style={{ color: (x.cambio ?? 0) >= 0 ? "var(--sig-strong)" : "var(--sig-avoid)" }}>{fmtPct(x.cambio, 2, true)}</p>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
