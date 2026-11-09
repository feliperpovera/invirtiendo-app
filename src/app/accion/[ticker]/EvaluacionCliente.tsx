"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Evaluation } from "@/lib/analysis/types";
import { EvaluationView } from "@/components/evaluation/EvaluationView";
import { Card, Eyebrow } from "@/components/ui";
import Loading from "./loading";

/**
 * La evaluación se pide a /api/stock desde el navegador (y no al renderizar la página):
 * en Cloudflare gratis el streaming de una página pesada se corta por CPU, la API no,
 * y su respuesta queda 10 min en la caché del borde (custom-worker.ts).
 */
export function EvaluacionCliente({ symbol }: { symbol: string }) {
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [error, setError] = useState<{ msg: string; etf: boolean } | null>(null);
  useEffect(() => {
    let vivo = true;
    setEv(null);
    setError(null);
    fetch(`/api/stock/${encodeURIComponent(symbol)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!vivo) return;
        if (r.ok) setEv(j);
        else setError({ msg: j.error ?? "Error del proveedor de datos", etf: j.code === "ETF" });
      })
      .catch(() => vivo && setError({ msg: "Sin conexión con el servidor", etf: false }));
    return () => {
      vivo = false;
    };
  }, [symbol]);

  if (ev) return <EvaluationView ev={ev} />;
  if (!error) return <Loading />;
  return (
    <div className="pt-10 max-w-2xl mx-auto">
      <Card>
        <Eyebrow>{error.etf ? `${symbol} es un ETF` : `No pude evaluar ${symbol}`}</Eyebrow>
        <h1 className="font-display text-3xl mt-1">{error.etf ? "Los ETFs no pasan por el checklist de acciones." : "Algo no cuadra con ese símbolo."}</h1>
        <p className="mt-3 text-ink-soft">{error.msg}</p>
        {!error.etf && (
          <ul className="mt-4 text-sm list-disc list-inside text-ink-soft space-y-1">
            <li>Usa el ticker de EE. UU. tal como aparece en tu bróker (NVDA, MSFT, BRK-B, TSM).</li>
            <li>Si la empresa cotiza solo fuera de EE. UU., aún no está cubierta.</li>
            <li>Si el proveedor de datos está saturado, vuelve a intentarlo en un minuto.</li>
          </ul>
        )}
        <Link href="/" className="btn btn-primary mt-5">
          Volver a buscar
        </Link>
      </Card>
    </div>
  );
}
