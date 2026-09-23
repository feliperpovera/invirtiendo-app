"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { EtfEval } from "@/lib/analysis/etf";
import { solapamiento, consejoPorAnimo } from "@/lib/analysis/etf";
import type { MarketPulse } from "@/lib/analysis/types";
import { Card, Eyebrow, PassDot } from "./ui";
import { SearchBox } from "./SearchBox";
import { fmtMoney, fmtPct, fmtBig, fmtX, isNum } from "@/lib/format";

type State = { status: "loading" } | { status: "ok"; ev: EtfEval } | { status: "error"; msg: string };

const COLORS = ["var(--terracotta)", "var(--olive-deep)", "var(--ink)", "var(--sig-watch)", "var(--olive-2)"];

export function CompareEtf({ initial }: { initial: string[] }) {
  const [tickers, setTickers] = useState<string[]>(initial.slice(0, 4));
  const [data, setData] = useState<Record<string, State>>({});
  const [mood, setMood] = useState<MarketPulse["mood"] | null>(null);

  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((j) => j.mood && setMood(j.mood))
      .catch(() => {});
  }, []);

  useEffect(() => {
    for (const t of tickers) {
      if (data[t]) continue;
      setData((d) => ({ ...d, [t]: { status: "loading" } }));
      fetch(`/api/etf/${encodeURIComponent(t)}`)
        .then(async (r) => {
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || "error");
          setData((d) => ({ ...d, [t]: { status: "ok", ev: j as EtfEval } }));
        })
        .catch((e) => setData((d) => ({ ...d, [t]: { status: "error", msg: e instanceof Error ? e.message : "error" } })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers]);

  const evs = tickers.map((t) => ({ t, s: data[t] }));
  const ready = evs.filter((e) => e.s?.status === "ok").map((e) => ({ t: e.t, ev: (e.s as { ev: EtfEval }).ev }));

  const add = (t: string) => {
    if (t && !tickers.includes(t) && tickers.length < 4) setTickers([...tickers, t]);
  };

  /** Fila con resaltado del mejor valor */
  const row = (label: string, get: (ev: EtfEval) => number | null, fmt: (v: number | null) => string, lowerIsBetter?: boolean, detail?: string) => {
    const vals = evs.map(({ s }) => (s?.status === "ok" ? get(s.ev) : null));
    let best = -1;
    if (lowerIsBetter !== undefined) {
      const cand = vals.map((v, i) => [v, i] as [number | null, number]).filter(([v]) => isNum(v)) as Array<[number, number]>;
      if (cand.length > 1) {
        cand.sort((a, b) => (lowerIsBetter ? a[0] - b[0] : b[0] - a[0]));
        best = cand[0][1];
      }
    }
    return (
      <tr key={label}>
        <td className="font-medium whitespace-nowrap">
          {label}
          {detail && <div className="text-[0.68rem] text-ink-soft font-normal">{detail}</div>}
        </td>
        {evs.map(({ t, s }, i) => (
          <td key={t} className={`num ${i === best ? "font-bold" : ""}`} style={i === best ? { color: "var(--sig-strong)" } : undefined}>
            {s?.status === "ok" ? fmt(vals[i]) : s?.status === "error" ? "—" : <span className="skeleton inline-block w-14 h-4" />}
          </td>
        ))}
      </tr>
    );
  };

  // Solapamiento por pares
  const pares = useMemo(() => {
    const out: Array<{ a: string; b: string; pct: number; comunes: Array<{ symbol: string; a: number; b: number }> }> = [];
    for (let i = 0; i < ready.length; i++)
      for (let j = i + 1; j < ready.length; j++) {
        const s = solapamiento(ready[i].ev.profile.holdings, ready[j].ev.profile.holdings);
        out.push({ a: ready[i].t, b: ready[j].t, ...s });
      }
    return out.sort((x, y) => y.pct - x.pct);
  }, [ready]);

  const consejo = consejoPorAnimo(mood?.score ?? null);

  return (
    <div className="space-y-4">
      <Card className="relative z-30">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {tickers.map((t, i) => (
            <span key={t} className="pill text-cream" style={{ background: COLORS[i % COLORS.length] }}>
              {t}
              <button type="button" aria-label={`Quitar ${t}`} className="ml-1 opacity-70 hover:opacity-100" onClick={() => setTickers(tickers.filter((x) => x !== t))}>
                ✕
              </button>
            </span>
          ))}
          <span className="text-xs text-ink-soft ml-auto">Hasta 4 ETFs · en verde, el mejor de cada fila</span>
        </div>
        {tickers.length < 4 && <SearchBox onSelect={add} placeholder="Añadir ETF: QQQM, VOO, SMH, SCHD…" />}
      </Card>

      {/* Ritmo según el mercado */}
      {mood && (
        <Card ink className="flex flex-wrap items-center gap-4">
          <div>
            <Eyebrow>Fear &amp; Greed (CNN)</Eyebrow>
            <p className="font-display text-3xl leading-none mt-1">
              {mood.score} <span className="text-base muted">· {mood.label}</span>
            </p>
          </div>
          <div className="flex-1 min-w-[240px]">
            <p className="font-bold text-sm">{consejo.titulo}</p>
            <p className="text-sm muted">{consejo.texto}</p>
          </div>
        </Card>
      )}

      {tickers.length === 0 && (
        <Card className="text-center py-10">
          <p className="font-display text-2xl">Añade 2 a 4 ETFs para compararlos.</p>
        </Card>
      )}

      {tickers.length > 0 && (
        <>
          <Card className="p-0 overflow-hidden">
            <div className="scroll-x">
              <table className="table min-w-[640px]">
                <thead>
                  <tr>
                    <th />
                    {evs.map(({ t, s }) => (
                      <th key={t} className="num">
                        {t}
                        {s?.status === "ok" && <div className="text-[0.65rem] font-normal normal-case tracking-normal text-ink-soft truncate max-w-[11rem]">{s.ev.profile.name}</div>}
                        {s?.status === "error" && <div className="text-[0.65rem] font-normal normal-case tracking-normal text-terracotta">sin datos de fondo</div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="font-medium">Categoría</td>
                    {evs.map(({ t, s }) => (
                      <td key={t} className="num text-xs">
                        {s?.status === "ok" ? (s.ev.profile.category ?? "—") : "—"}
                      </td>
                    ))}
                  </tr>
                  {row("Score Invirtiendo", (ev) => ev.score.total, (v) => (isNum(v) ? `${v}/100` : "—"), false)}
                  {row("Comisión anual", (ev) => ev.profile.expenseRatio, (v) => fmtPct(v, 2), true, "Lo único que controlas con certeza")}
                  {row("Costo en 10 años", (ev) => ev.costo10k, (v) => (isNum(v) ? `−${fmtMoney(v, 0)}` : "—"), true, "Sobre $10.000 al 8% anual")}
                  {row("Patrimonio (AUM)", (ev) => ev.profile.aum, (v) => fmtBig(v, 1), false)}
                  {row("Dividendo", (ev) => ev.profile.dividendYield, (v) => fmtPct(v, 2), false)}
                  {row("Retorno YTD", (ev) => ev.profile.returns.ytd, (v) => fmtPct(v, 1, true), false)}
                  {row("Retorno 1 año", (ev) => ev.profile.returns.y1, (v) => fmtPct(v, 1, true), false)}
                  {row("Anualizado 3 años", (ev) => ev.profile.returns.y3, (v) => fmtPct(v, 1, true), false)}
                  {row("Anualizado 5 años", (ev) => ev.profile.returns.y5, (v) => fmtPct(v, 1, true), false)}
                  {row("Anualizado 10 años", (ev) => ev.profile.returns.y10, (v) => fmtPct(v, 1, true), false)}
                  {row("Peor año publicado", (ev) => ev.peorAnio?.value ?? null, (v) => fmtPct(v, 1, true), false, "¿Aguantarías esa caída?")}
                  {row("Volatilidad de resultados anuales", (ev) => ev.volAnual, (v) => fmtPct(v, 1), true)}
                  {row("Beta 3 años", (ev) => ev.profile.beta3y, (v) => (isNum(v) ? v.toFixed(2) : "—"), true)}
                  {row("Top 10 posiciones", (ev) => ev.top10, (v) => fmtPct(v, 1), true, "Menos concentración, menos depender de pocas empresas")}
                  {row("P/E de la cartera", (ev) => ev.profile.equity.pe, (v) => fmtX(v), true)}
                  {row("P/Valor libro", (ev) => ev.profile.equity.pb, (v) => fmtX(v), true)}
                  <tr>
                    <td className="font-medium">Inicio</td>
                    {evs.map(({ t, s }) => (
                      <td key={t} className="num text-xs">
                        {s?.status === "ok" ? (s.ev.profile.inception?.slice(0, 4) ?? "—") : "—"}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Sectores */}
          {ready.length > 0 && (
            <Card>
              <Eyebrow className="mb-3">Dónde está invertido cada uno</Eyebrow>
              <div className="space-y-4">
                {ready.map(({ t, ev }, i) => (
                  <div key={t}>
                    <div className="flex justify-between text-sm mb-1">
                      <b>{t}</b>
                      <span className="text-ink-soft text-xs">{ev.profile.sectors.length ? `${ev.profile.sectors[0].label} manda con ${ev.profile.sectors[0].weight.toFixed(0)}%` : "sin desglose"}</span>
                    </div>
                    <div className="flex h-6 rounded-lg overflow-hidden bg-cream-2">
                      {ev.profile.sectors.slice(0, 6).map((s, j) => (
                        <div
                          key={s.key}
                          className="flex items-center justify-center text-[0.6rem] font-bold text-cream overflow-hidden"
                          style={{ width: `${s.weight}%`, background: COLORS[(i + j) % COLORS.length], opacity: 1 - j * 0.12 }}
                          title={`${s.label} ${s.weight.toFixed(1)}%`}
                        >
                          {s.weight > 12 ? `${s.weight.toFixed(0)}%` : ""}
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[0.68rem] text-ink-soft">
                      {ev.profile.sectors.slice(0, 6).map((s) => (
                        <span key={s.key}>
                          {s.label} {s.weight.toFixed(0)}%
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Participaciones */}
          {ready.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <Eyebrow className="px-5 pt-5">Top 10 posiciones</Eyebrow>
              <div className="scroll-x mt-2">
                <table className="table min-w-[560px]">
                  <thead>
                    <tr>
                      <th>#</th>
                      {ready.map(({ t }) => (
                        <th key={t} colSpan={2}>
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: Math.max(...ready.map((r) => r.ev.profile.holdings.length), 0) }).map((_, i) => (
                      <tr key={i}>
                        <td className="text-ink-soft">{i + 1}</td>
                        {ready.map(({ t, ev }) => {
                          const h = ev.profile.holdings[i];
                          return (
                            <Fragment key={t}>
                              <td className="font-semibold">{h?.symbol ?? "—"}</td>
                              <td className="num text-ink-soft">{h ? `${h.weight.toFixed(1)}%` : ""}</td>
                            </Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Solapamiento */}
          {pares.length > 0 && (
            <Card>
              <Eyebrow>Solapamiento · ¿compras lo mismo dos veces?</Eyebrow>
              <div className="space-y-3 mt-3">
                {pares.map((p) => (
                  <div key={`${p.a}-${p.b}`}>
                    <div className="flex justify-between text-sm">
                      <b>
                        {p.a} vs {p.b}
                      </b>
                      <span className="num font-bold" style={{ color: p.pct >= 25 ? "var(--sig-avoid)" : p.pct >= 12 ? "var(--sig-watch)" : "var(--sig-strong)" }}>
                        {p.pct.toFixed(1)}% del capital repetido
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-cream-2 mt-1 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, p.pct * 2)}%`, background: p.pct >= 25 ? "var(--sig-avoid)" : p.pct >= 12 ? "var(--sig-watch)" : "var(--sig-strong)" }} />
                    </div>
                    <p className="text-xs text-ink-soft mt-1">
                      {p.comunes.length ? `Comparten ${p.comunes.length} de sus 10 mayores: ${p.comunes.slice(0, 6).map((c) => c.symbol).join(", ")}` : "Sin posiciones repetidas en el top 10"}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-soft mt-3">
                Medido sobre las 10 mayores posiciones de cada fondo. Por encima de 25% estás pagando dos comisiones por la misma exposición: quédate con el más barato y usa el otro para diversificar de verdad.
              </p>
            </Card>
          )}

          {/* Checklist por ETF */}
          {ready.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {ready.map(({ t, ev }) => (
                <Card key={t}>
                  <div className="flex items-baseline justify-between gap-2">
                    <Eyebrow>{t}</Eyebrow>
                    <span className="num font-display text-2xl">{ev.score.total}/100</span>
                  </div>
                  <ul className="divide-y divide-line-soft mt-2">
                    {ev.checks.map((c) => (
                      <li key={c.label} className="flex items-start gap-3 py-2 text-sm">
                        <PassDot pass={c.pass} />
                        <div className="flex-1 min-w-0">
                          <p className="leading-snug">{c.label}</p>
                          {c.detail && <p className="text-xs text-ink-soft">{c.detail}</p>}
                        </div>
                        <span className="num font-semibold text-right shrink-0">{c.value}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
