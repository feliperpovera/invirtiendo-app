"use client";

import { useState } from "react";

export type EstadoOrden<K extends string> = { k: K; desc: boolean };
/** Estado de orden de una lista: el mismo encabezado invierte; uno nuevo empieza de mayor a menor (texto: A→Z). */
export function useOrden<K extends string>(k: K, desc: boolean, textos: readonly K[] = []) {
  const [o, setO] = useState<EstadoOrden<K>>({ k, desc });
  const elegir = (n: K) => setO((v) => (v.k === n ? { k: n, desc: !v.desc } : { k: n, desc: !textos.includes(n) }));
  return { o, setO, elegir };
}

type Ctl<K extends string> = ReturnType<typeof useOrden<K>>;

/** Encabezado que ordena: ↕ sin usar, ▲ menor a mayor, ▼ mayor a menor. */
export function BotonOrden<K extends string>({ ctl, k, children }: { ctl: Ctl<K>; k: K; children: React.ReactNode }) {
  const activo = ctl.o.k === k;
  return (
    <button type="button" onClick={() => ctl.elegir(k)} aria-label={`Ordenar por ${children}${activo ? (ctl.o.desc ? ", de mayor a menor" : ", de menor a mayor") : ""}`} className={`uppercase tracking-wider whitespace-nowrap py-1 hover:text-terracotta ${activo ? "text-ink font-bold" : ""}`}>
      {children} <span aria-hidden className={activo ? "text-terracotta" : "opacity-40"}>{activo ? (ctl.o.desc ? "▼" : "▲") : "↕"}</span>
    </button>
  );
}

export function ThOrden<K extends string>({ ctl, k, className, children }: { ctl: Ctl<K>; k: K; className?: string; children: React.ReactNode }) {
  return <th scope="col" className={className} aria-sort={ctl.o.k === k ? (ctl.o.desc ? "descending" : "ascending") : "none"}><BotonOrden ctl={ctl} k={k}>{children}</BotonOrden></th>;
}

/** Lista desplegable + flecha: para el celular (columnas ocultas) y listas sin encabezados. */
export function SelectOrden<K extends string>({ ctl, opciones, className = "" }: { ctl: Ctl<K>; opciones: ReadonlyArray<readonly [K, string]>; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <select className="input py-1.5 text-sm !w-auto min-w-0" value={ctl.o.k} onChange={(e) => ctl.elegir(e.target.value as K)} aria-label="Ordenar por">
        {opciones.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <button type="button" onClick={() => ctl.elegir(ctl.o.k)} className="rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-ink" aria-label={ctl.o.desc ? "De mayor a menor; invertir" : "De menor a mayor; invertir"}>
        {ctl.o.desc ? "▼" : "▲"}
      </button>
    </div>
  );
}
