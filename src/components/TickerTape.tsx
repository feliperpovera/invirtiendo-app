"use client";

import { useEffect, useState } from "react";

type Item = { symbol: string; nombre: string; tasa: boolean; precio: number; cambio: number | null };
const fmt = (i: Item) => (i.tasa ? `${i.precio.toFixed(2)}%` : i.precio >= 1000 ? i.precio.toLocaleString("en-US", { maximumFractionDigits: 0 }) : i.precio.toLocaleString("en-US", { maximumFractionDigits: 2 }));

/** Cinta de precios bajo el menú (como la de TradingView). Se refresca cada minuto; sin animación si el usuario pidió menos movimiento. */
export function TickerTape() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const cargar = () => fetch("/api/mercados?ligero=1").then((r) => r.json()).then(setItems).catch(() => {});
    cargar();
    const t = setInterval(cargar, 60_000);
    return () => clearInterval(t);
  }, []);
  if (!items.length) return <div className="h-8 bg-ink-2 border-b border-[#3a3831]" aria-hidden />;
  const fila = (k: string) => (
    <div className="flex shrink-0 items-center gap-6 pr-6" aria-hidden={k === "b"}>
      {items.map((i) => (
        <a key={k + i.symbol} href="/mercados" className="flex items-center gap-1.5 whitespace-nowrap text-xs hover:text-cream">
          <span className="text-[#a9a296]">{i.nombre}</span>
          <span className="num text-cream font-semibold">{fmt(i)}</span>
          {i.cambio != null && (
            <span className="num font-semibold" style={{ color: i.cambio >= 0 ? "#9fb37a" : "#e08a6a" }}>
              {i.cambio >= 0 ? "▲" : "▼"} {Math.abs(i.cambio).toFixed(2)}%
            </span>
          )}
        </a>
      ))}
    </div>
  );
  return (
    <div className="bg-ink-2 border-b border-[#3a3831] overflow-hidden h-8 flex items-center group" role="marquee" aria-label="Precios de mercado">
      <div className="flex cinta motion-reduce:animate-none group-hover:[animation-play-state:paused]">
        {fila("a")}
        {fila("b")}
      </div>
    </div>
  );
}
