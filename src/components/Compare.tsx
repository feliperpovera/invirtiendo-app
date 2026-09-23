"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Evaluation } from "@/lib/analysis/types";
import { Card, Eyebrow, SignalPill, VerdictPill } from "./ui";
import { SearchBox } from "./SearchBox";
import { fmtMoney, fmtBig, fmtX, fmtPct, isNum } from "@/lib/format";

type State = { status: "loading" } | { status: "ok"; ev: Evaluation } | { status: "error"; msg: string };

export function Compare({ initial }: { initial: string[] }) {
  const [tickers, setTickers] = useState<string[]>(initial.slice(0, 5));
  const [data, setData] = useState<Record<string, State>>({});

  useEffect(() => {
    for (const t of tickers) {
      if (data[t]) continue;
      setData((d) => ({ ...d, [t]: { status: "loading" } }));
      fetch(`/api/stock/${encodeURIComponent(t)}`)
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "error");
          setData((d) => ({ ...d, [t]: { status: "ok", ev: j as Evaluation } }));
        })
        .catch((e) => setData((d) => ({ ...d, [t]: { status: "error", msg: e instanceof Error ? e.message : "error" } })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers]);

  const add = (t: string) => {
    if (t && !tickers.includes(t) && tickers.length < 5) setTickers([...tickers, t]);
  };
  const evs = tickers.map((t) => ({ t, s: data[t] }));
  const cell = (f: (ev: Evaluation) => React.ReactNode) =>
    evs.map(({ t, s }) => (
      <td key={t} className="num">
        {s?.status === "ok" ? f(s.ev) : s?.status === "error" ? <span className="text-xs text-terracotta">{s.msg.slice(0, 40)}</span> : <span className="skeleton inline-block w-14 h-4" />}
      </td>
    ));
  const best = (vals: Array<number | null>, lowerIsBetter: boolean) => {
    const v = vals.map((x, i) => [x, i] as [number | null, number]).filter(([x]) => isNum(x) && (x as number) > 0) as Array<[number, number]>;
    if (v.length < 2) return -1;
    v.sort((a, b) => (lowerIsBetter ? a[0] - b[0] : b[0] - a[0]));
    return v[0][1];
  };
  const row = (label: string, get: (ev: Evaluation) => number | null, fmt: (v: number | null) => string, lowerIsBetter?: boolean) => {
    const vals = evs.map(({ s }) => (s?.status === "ok" ? get(s.ev) : null));
    const b = lowerIsBetter === undefined ? -1 : best(vals, lowerIsBetter);
    return (
      <tr key={label}>
        <td className="font-medium whitespace-nowrap">{label}</td>
        {evs.map(({ t, s }, i) => (
          <td key={t} className={`num ${i === b ? "font-bold" : ""}`} style={i === b ? { color: "var(--sig-strong)" } : undefined}>
            {s?.status === "ok" ? fmt(vals[i]) : s?.status === "error" ? "—" : <span className="skeleton inline-block w-14 h-4" />}
          </td>
        ))}
      </tr>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="relative z-30">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {tickers.map((t) => (
            <span key={t} className="pill bg-ink text-cream">
              {t}
              <button type="button" aria-label={`Quitar ${t}`} className="ml-1 opacity-70 hover:opacity-100" onClick={() => setTickers(tickers.filter((x) => x !== t))}>
                ✕
              </button>
            </span>
          ))}
          <span className="text-xs text-ink-soft ml-auto">Hasta 5 acciones · en verde, la mejor de cada fila</span>
        </div>
        {tickers.length < 5 && <SearchBox onSelect={add} placeholder="Añadir ticker o nombre…" />}
      </Card>
      {tickers.length > 0 && (
        <Card className="p-0 overflow-hidden">
          <div className="scroll-x">
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th />
                  {evs.map(({ t, s }) => (
                    <th key={t} className="num">
                      <Link href={`/accion/${t}`} className="hover:text-terracotta">
                        {t}
                      </Link>
                      {s?.status === "ok" && <div className="text-[0.65rem] font-normal normal-case tracking-normal text-ink-soft truncate max-w-[9rem]">{s.ev.profile.name}</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">Señal</td>
                  {cell((ev) => <SignalPill k={ev.score.signal.key} label={ev.score.signal.label} />)}
                </tr>
                <tr>
                  <td className="font-medium">Pilares</td>
                  {cell((ev) => (
                    <span>
                      <b>{ev.buffett.passed}/6</b> <span className="text-xs text-ink-soft">{ev.buffett.verdict}</span>
                    </span>
                  ))}
                </tr>
                {row("Invirtiendo Score", (ev) => ev.score.total, (v) => (isNum(v) ? `${v}/100` : "—"), false)}
                {row("Precio", (ev) => ev.quote.price, (v) => fmtMoney(v))}
                {row("Fair Value", (ev) => ev.valuation.intrinsic.blended, (v) => fmtMoney(v))}
                {row("Margin of Safety", (ev) => ev.valuation.marginOfSafety, (v) => fmtPct(v, 0, true), false)}
                {row("Promedio 52 semanas", (ev) => (isNum(ev.quote.high52) && isNum(ev.quote.low52) ? (ev.quote.high52 + ev.quote.low52) / 2 : null), (v) => fmtMoney(v))}
                {/* Qué tan arriba está el precio dentro de su rango anual: cerca del mínimo (0%) es más barato */}
                {row(
                  "Posición en rango 52 sem",
                  (ev) => (isNum(ev.quote.high52) && isNum(ev.quote.low52) && ev.quote.high52 > ev.quote.low52 ? ((ev.quote.price - ev.quote.low52) / (ev.quote.high52 - ev.quote.low52)) * 100 : null),
                  (v) => fmtPct(v, 0),
                  true,
                )}
                {row("Capitalización", (ev) => ev.metrics.marketCap, (v) => fmtBig(v, 0))}
                {row("P/E", (ev) => ev.valuation.multiples.pe, (v) => fmtX(v), true)}
                {/* El mismo forward P/E de la ficha: precio ÷ EPS de consenso del próximo año. `metrics.forwardPe` viene de Yahoo con otra base y daba dos números con la misma etiqueta. */}
                {row("Forward P/E", (ev) => ev.valuation.multiples.forwardPe ?? ev.metrics.forwardPe, (v) => fmtX(v), true)}
                {row("PEG", (ev) => ev.valuation.multiples.peg, (v) => (isNum(v) ? v.toFixed(2) : "n.s."), true)}
                {row("P/FCF", (ev) => ev.valuation.multiples.pFcf, (v) => fmtX(v), true)}
                {row("Margen bruto", (ev) => ev.metrics.grossMargin, (v) => fmtPct(v, 0), false)}
                {row("Margen neto", (ev) => ev.metrics.netMargin, (v) => fmtPct(v, 0), false)}
                {row("ROE", (ev) => ev.metrics.roe, (v) => fmtPct(v, 0), false)}
                {row("ROIC (aprox.)", (ev) => ev.metrics.roic, (v) => fmtPct(v, 0), false)}
                {row("Crec. ingresos 5a", (ev) => ev.metrics.revenueGrowth5Y, (v) => fmtPct(v, 0), false)}
                {row("Deuda / patrimonio", (ev) => ev.metrics.debtToEquity, (v) => fmtX(v, 2), true)}
                {row("Beta", (ev) => ev.risk.beta, (v) => (isNum(v) ? v.toFixed(2) : "—"), true)}
                <tr>
                  <td className="font-medium">Riesgo</td>
                  {cell((ev) => <span>{ev.risk.level}</span>)}
                </tr>
                <tr>
                  <td className="font-medium">Noticias</td>
                  {cell((ev) => <VerdictPill v={ev.sentiment.verdict} size="sm" />)}
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {!tickers.length && (
        <Card className="text-center py-10">
          <Eyebrow>Comparar</Eyebrow>
          <p className="font-display text-2xl mt-1">Añade 2 a 5 tickers para verlos lado a lado.</p>
        </Card>
      )}
    </div>
  );
}
