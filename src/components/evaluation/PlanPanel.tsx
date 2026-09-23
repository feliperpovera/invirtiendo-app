"use client";

import { useState } from "react";
import Link from "next/link";
import type { Evaluation, ScoreResult } from "@/lib/analysis/types";
import type { Adjusted } from "@/lib/analysis/adjust";
import { useWatchlist } from "@/lib/watchlist";
import { leerLead } from "@/lib/lead";
import { LeadForm } from "@/components/LeadGate";
import { Card, Eyebrow } from "@/components/ui";
import { fmtMoney, fmtPct, isNum } from "@/lib/format";

export function PlanPanel({ ev, adjusted, signal, buffettPassed }: { ev: Evaluation; adjusted: Adjusted; signal: ScoreResult["signal"]; buffettPassed: number }) {
  const { has, upsert, ready } = useWatchlist();
  const inList = has(ev.symbol);
  const [copied, setCopied] = useState(false);
  // La watchlist es lo único que pide registro: sin él, el botón abre el formulario.
  const [pedirRegistro, setPedirRegistro] = useState(false);
  const plan = ev.plan;

  // Re-derivar precios de tramos con el Fair Value ajustado por el usuario
  const price = ev.quote.price;
  const tranches = plan.tranches.map((tr) => {
    if (/Buy Zone fuerte/.test(tr.label)) return { ...tr, price: adjusted.buyZone.strong };
    if (/zona gradual/.test(tr.label)) return { ...tr, price: adjusted.buyZone.gradual };
    return tr;
  });

  const addToWatchlist = () => {
    upsert({
      symbol: ev.symbol,
      name: ev.profile.name,
      fairValue: adjusted.blended,
      zoneGradual: adjusted.buyZone.gradual,
      zoneStrong: adjusted.buyZone.strong,
      signal: signal.key,
      signalLabel: signal.label,
      score: ev.score.total,
      buffettPassed,
      profile: ev.risk.profile,
    });
  };

  const summaryText = () =>
    [
      `${ev.symbol} · ${ev.profile.name} — Evaluación Invirtiendo`,
      `Precio ${fmtMoney(price)} · Fair Value ${fmtMoney(adjusted.blended)} · margen ${fmtPct(adjusted.mos, 0, true)}`,
      `Pilares ${buffettPassed}/6 · Score ${ev.score.total}/100 · Señal: ${signal.label}`,
      `Zona compra: gradual ${fmtMoney(adjusted.buyZone.gradual, 0)} · fuerte ${fmtMoney(adjusted.buyZone.strong, 0)}`,
      `Información educativa, no recomendación. @Invirtiendoo`,
    ]
      .filter(Boolean)
      .join("\n");

  return (
    <section id="plan">
      <Eyebrow className="mb-2">Plan de compra</Eyebrow>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <Eyebrow>Watchlist y resumen</Eyebrow>
          <p className="text-sm text-ink-soft mt-2">Guarda la acción con su Fair Value y sus zonas de compra; la fila se ilumina cuando el precio llegue.</p>
          <div className="flex flex-wrap gap-2 mt-4">
            {ready && (
              <button type="button" className={`btn ${inList ? "btn-ghost" : "btn-primary"}`} onClick={() => (leerLead() ? addToWatchlist() : setPedirRegistro(true))}>
                {inList ? "Actualizar en watchlist" : "Agregar a watchlist"}
              </button>
            )}
            {inList && (
              <Link href="/watchlist" className="btn btn-ghost">
                Ver watchlist
              </Link>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(summaryText());
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copiado" : "Copiar resumen"}
            </button>
          </div>
          {pedirRegistro && (
            <LeadForm
              className="mt-4"
              detalle={ev.symbol}
              onListo={() => {
                setPedirRegistro(false);
                addToWatchlist();
              }}
            />
          )}
        </Card>

        <Card ink>
          <Eyebrow>Plan · {tranches.length} tramos</Eyebrow>
          <h3 className="font-display text-xl mt-1">
            Perfil {plan.profile === "nucleo" ? "núcleo" : "satélite"} · máximo {plan.maxWeightPct}% del portafolio
          </h3>
          <table className="w-full text-sm mt-4">
            <thead>
              <tr className="text-[0.68rem] uppercase tracking-wider muted">
                <th className="text-left font-bold pb-2">Tramo</th>
                <th className="text-right font-bold pb-2">Precio límite</th>
                <th className="text-right font-bold pb-2">% del monto</th>
              </tr>
            </thead>
            <tbody>
              {tranches.map((tr) => (
                <tr key={tr.n} className="border-t border-[#3a3831]">
                  <td className="py-2.5">
                    <span className="font-display text-lg mr-2" style={{ color: "var(--terracotta)" }}>
                      {tr.n}
                    </span>
                    {tr.label}
                  </td>
                  <td className="py-2.5 text-right num font-bold">{isNum(tr.price) ? fmtMoney(tr.price) : "—"}</td>
                  <td className="py-2.5 text-right num">{tr.sharePct ? `${tr.sharePct}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-4 space-y-1.5 text-sm muted">
            {plan.rules.slice(0, 3).map((r) => (
              <li key={r} className="flex gap-2">
                <span style={{ color: "var(--terracotta)" }}>◆</span>
                {r}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
