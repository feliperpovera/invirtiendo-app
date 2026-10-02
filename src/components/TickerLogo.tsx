"use client";

import { useState } from "react";

/** Logo oficial de la empresa (Financial Modeling Prep, sin llave), siempre en un cuadro del mismo tamaño. Sin logo: iniciales. */
export function TickerLogo({ symbol, size = 28, className = "" }: { symbol: string; size?: number; className?: string }) {
  const [falla, setFalla] = useState(false);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {falla ? (
        <span className="font-bold text-ink-soft" style={{ fontSize: size * 0.34 }}>{symbol.slice(0, 2)}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol.toUpperCase())}.png`} alt="" width={size} height={size} loading="lazy" className="h-full w-full object-contain p-[12%]" onError={() => setFalla(true)} />
      )}
    </span>
  );
}
