"use client";

import { useState } from "react";

/**
 * Logo oficial de la empresa (Financial Modeling Prep, sin llave), siempre en un cuadro del mismo tamaño.
 * Varios logos de esa fuente son blancos sobre transparente (Uber, Disney): al cargar se mide su brillo y,
 * si es claro, el cuadro pasa a fondo tinta. Sin logo o imagen vacía: iniciales.
 */
export function TickerLogo({ symbol, size = 28, className = "" }: { symbol: string; size?: number; className?: string }) {
  const [estado, setEstado] = useState<"claro" | "oscuro" | "falla">("oscuro");
  const medir = (img: HTMLImageElement) => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 24;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, 24, 24);
      const d = ctx.getImageData(0, 0, 24, 24).data;
      let n = 0, luz = 0, transparentes = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 40) { transparentes++; continue; }
        n++;
        luz += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      }
      if (!n) return setEstado("falla");
      // Claro solo si además tiene fondo transparente: un logo con su propio fondo blanco se ve bien tal cual
      setEstado(luz / n > 200 && transparentes > 40 ? "claro" : "oscuro");
    } catch {
      /* sin CORS: se deja como está */
    }
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line ${className}`}
      style={{ width: size, height: size, background: estado === "claro" ? "var(--ink)" : "#fff" }}
      aria-hidden
    >
      {estado === "falla" ? (
        <span className="font-bold text-ink-soft" style={{ fontSize: size * 0.34 }}>{symbol.slice(0, 2)}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol.toUpperCase())}.png`}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          crossOrigin="anonymous"
          className="h-full w-full object-contain p-[12%]"
          onLoad={(e) => medir(e.currentTarget)}
          onError={() => setEstado("falla")}
        />
      )}
    </span>
  );
}
