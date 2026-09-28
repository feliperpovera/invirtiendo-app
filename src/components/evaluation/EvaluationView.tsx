"use client";

import { useMemo, useState } from "react";
import type { Evaluation, Verdict } from "@/lib/analysis/types";
import { verdictFromFilters } from "@/lib/analysis/buffett";
import { signalFor } from "@/lib/analysis/score";
import { fuentesDeAcuerdo } from "@/lib/analysis/forward";
import { adjustValuation } from "@/lib/analysis/adjust";
import { fmtMoney, fmtBig, fmtPct, fmtX, isNum } from "@/lib/format";
import { Card, Eyebrow, SignalPill, Delta, Stat } from "@/components/ui";
import { ScoreRing, PillarBar, BuyZoneGauge, RangeBar } from "@/components/charts";
import { PriceFairValueChart } from "@/components/PriceFairValueChart";
import { MonthlyStrip } from "@/components/MonthlyStrip";
import { TimeAgo } from "@/components/ClientTime";
import { Checklist } from "./Checklist";
import { ValuationPanel } from "./ValuationPanel";
import { Financials } from "./Financials";
import { RiskCard, PeersCard, NewsCard } from "./NewsPeers";
import { AnalistasCard } from "./Analistas";
import { PlanPanel } from "./PlanPanel";
import { Consenso } from "./Consenso";

const VERDICT_ES: Record<string, string> = { BUY: "Comprar por tramos", WATCHLIST: "Watchlist: esperar precio", REVIEW: "Faltan datos en algún pilar", DISCARD: "No cumple los pilares" };

export function EvaluationView({ ev }: { ev: Evaluation }) {
  const [assump, setAssump] = useState(ev.valuation.lynch);
  const adjusted = useMemo(() => adjustValuation(ev.valuation, assump), [ev.valuation, assump]);
  // El pilar de precio se recalcula con el Fair Value ajustado; los otros cinco son datos y no cambian.
  const priceVerdict: Verdict = !isNum(adjusted.mos) ? "DUDOSO" : adjusted.mos >= 15 ? "PASA" : adjusted.mos >= -10 ? "DUDOSO" : "FALLA";
  const buffett = useMemo(
    () => verdictFromFilters(ev.buffett.filters.map((f) => (f.n === 6 ? { ...f, verdict: priceVerdict } : f)), adjusted.buyZone.gradual),
    [ev.buffett.filters, priceVerdict, adjusted.buyZone.gradual],
  );
  // Mismas reglas que el servidor, para que mover un slider no invente una señal que la API no daría.
  const signal = useMemo(
    () => signalFor(adjusted.mos, buffett.failedCore, fuentesDeAcuerdo(adjusted.componentes, adjusted.blended)),
    [adjusted.mos, adjusted.componentes, adjusted.blended, buffett.failedCore],
  );

  const q = ev.quote;
  const m = ev.metrics;
  const mosColor = isNum(adjusted.mos) ? (adjusted.mos >= 15 ? "var(--sig-strong)" : adjusted.mos >= -10 ? "var(--sig-watch)" : "var(--sig-avoid)") : "var(--ink)";
  const verdictColor = buffett.verdict === "BUY" ? "var(--sig-strong)" : buffett.verdict === "WATCHLIST" ? "var(--sig-watch)" : buffett.verdict === "REVIEW" ? "var(--sig-good)" : "var(--sig-avoid)";

  return (
    <div className="space-y-5 pt-6">
      {/* Header */}
      <section className="grid grid-cols-1 gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Eyebrow>{ev.profile.industry || ev.profile.sector || "Acción"}</Eyebrow>
            <span className={`pill ${ev.risk.profile === "nucleo" ? "bg-olive-tint text-olive-deep" : "bg-terracotta-tint text-terracotta-deep"}`}>{ev.risk.profile === "nucleo" ? "Núcleo" : "Satélite"}</span>
          </div>
          <h1 className="font-display text-4xl sm:text-5xl mt-1 leading-[0.95]">
            {ev.symbol} <span className="text-ink-soft text-2xl align-middle">· {ev.profile.name}</span>
          </h1>
          <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="w-full sm:w-auto">
              <p className="num font-display text-4xl leading-none">{fmtMoney(q.price)}</p>
              <p className="text-sm mt-1">
                <Delta v={q.changePct} /> <span className="text-ink-soft">· <TimeAgo ts={q.asOf} /></span>
              </p>
              {ev.complementos?.usdCop && (
                <p className="text-xs text-ink-soft mt-1 num" title={`Tasa de referencia USD/COP del ${ev.complementos.usdCop.date}: ${ev.complementos.usdCop.rate.toFixed(2)}`}>
                  ≈ COP {Math.round(q.price * ev.complementos.usdCop.rate).toLocaleString("es-CO")} por acción
                </p>
              )}
            </div>
            <div className="w-full sm:w-auto grid grid-cols-3 sm:flex sm:items-end gap-x-4 gap-y-3 sm:gap-6">
              <Stat label="Market cap" value={fmtBig(m.marketCap, 1)} />
              <Stat label="P/E" value={fmtX(m.pe)} sub={`5a ${fmtX(ev.valuation.multiples.peAvg5y)}`} />
              <Stat label="Fwd P/E" value={fmtX(ev.valuation.multiples.forwardPe)} />
              <Stat label="PEG fwd" value={isNum(ev.valuation.multiples.peg) && ev.valuation.multiples.peg > 0 && ev.valuation.multiples.peg < 10 ? ev.valuation.multiples.peg.toFixed(2) : "n.s."} />
              <Stat label="FCF yield" value={fmtPct(ev.valuation.multiples.fcfYield, 1)} />
              <Stat label="Dividendo" value={fmtPct(m.dividendYield, 2)} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 max-w-2xl">
          <RangeBar label="Rango del día" low={q.low} high={q.high} price={q.price} />
          <RangeBar label="Rango 52 semanas" low={q.low52} high={q.high52} price={q.price} />
        </div>
        <div className="lg:col-span-1">
          <p className="text-[0.68rem] uppercase tracking-wider font-bold text-ink-soft mb-1.5">Últimos meses</p>
          <MonthlyStrip daily={ev.history.daily} meses={5} />
        </div>
      </section>

      {/* Resumen */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <div className="flex items-start justify-between gap-2">
            <Eyebrow>Fair Value</Eyebrow>
            <SignalPill k={signal.key} label={signal.label} />
          </div>
          <p className="num font-display text-4xl mt-1 leading-none">{fmtMoney(adjusted.blended)}</p>
          <p className="text-sm mt-1">
            Margin of Safety <b className="num" style={{ color: mosColor }}>{fmtPct(adjusted.mos, 0, true)}</b>
          </p>
          <p className="text-xs text-ink-soft mt-1">
            Mediana de {ev.valuation.components.length} fuente{ev.valuation.components.length === 1 ? "" : "s"}: modelo adelantado, plataformas y analistas.
          </p>
          <div className="mt-3">
            <BuyZoneGauge price={q.price} fair={adjusted.buyZone.fair} gradual={adjusted.buyZone.gradual} strong={adjusted.buyZone.strong} />
          </div>
          {buffett.failedCore && <p className="text-xs mt-2 text-terracotta-deep">No cumple un pilar de calidad: solo como satélite (≤ 3%).</p>}
        </Card>
        <Card className="flex items-center gap-4">
          <div className="shrink-0">
            <ScoreRing value={ev.score.total} grade={ev.score.grade} size={104} />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <Eyebrow>Score</Eyebrow>
            {(
              [
                ["Datos", ev.score.components.data, ev.score.components.weights.data],
                ["Pilares", ev.score.components.buffett, ev.score.components.weights.buffett],
              ] as const
            ).map(([k, v, w]) => (
              <PillarBar key={k} title={k} score={v} weight={w} />
            ))}
            <p className="text-[0.68rem] text-ink-soft pt-1">{ev.score.pillars.map((p) => `${p.title} ${isNum(p.score) ? Math.round(p.score) : "—"}`).join(" · ")}</p>
          </div>
        </Card>
        <Card ink className="flex flex-col">
          <Eyebrow>Pilares</Eyebrow>
          <p className="font-display text-5xl mt-1 leading-none">
            {buffett.passed}
            <span className="text-2xl muted">/6</span>
          </p>
          <span className="pill mt-3 self-start" style={{ background: verdictColor, color: buffett.verdict === "WATCHLIST" ? "var(--ink)" : "var(--cream)" }}>
            {buffett.verdict}
          </span>
          <p className="text-sm mt-2 muted">{VERDICT_ES[buffett.verdict]}</p>
          <p className="text-xs mt-1 muted">{buffett.verdictText}</p>
        </Card>
      </section>

      {ev.warnings.length > 0 && (
        <div className="card p-3 text-xs bg-terracotta-tint border-terracotta-soft">
          {ev.warnings.map((w) => (
            <p key={w}>⚠︎ {w}</p>
          ))}
        </div>
      )}

      <Card>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <Eyebrow>Precio vs Fair Value</Eyebrow>
        </div>
        <PriceFairValueChart history={ev.history} fv={ev.fvHistory} current={q.price} asOf={ev.asOf} height={320} />
      </Card>

      <ValuationPanel v={ev.valuation} adjusted={adjusted} assump={assump} setAssump={setAssump} />
      <AnalistasCard v={ev.valuation} s={ev.sentiment} price={q.price} />
      <Checklist filters={buffett.filters} />
      <Financials ev={ev} />
      {ev.consenso && <Consenso filas={ev.consenso} moneda={ev.profile.statementCurrency && ev.profile.statementCurrency !== "USD" ? ev.profile.statementCurrency : "USD"} />}
      <RiskCard risk={ev.risk} shortInterest={ev.complementos?.shortInterest} />
      <PeersCard peers={ev.peers} symbol={ev.symbol} />
      <NewsCard s={ev.sentiment} wsb={ev.complementos?.wsb} />
      <PlanPanel ev={ev} adjusted={adjusted} signal={signal} buffettPassed={buffett.passed} />

      <p className="text-xs text-ink-soft border-t border-line pt-3">
        Fuentes: {ev.sources.filter((s) => s.ok).map((s) => s.provider).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}. Información educativa, no asesoría financiera.
      </p>
    </div>
  );
}
