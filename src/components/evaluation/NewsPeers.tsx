"use client";

import { useState } from "react";
import Link from "next/link";
import type { RiskResult, PeersResult, SentimentResult, CheckItem, NewsItem, SentLabel, ShortInterest, WsbSentiment } from "@/lib/analysis/types";
import { Card, Eyebrow, VerdictPill } from "@/components/ui";
import { fmtMoney, fmtBig, fmtX, fmtPct, isNum } from "@/lib/format";
import { TimeAgo } from "@/components/ClientTime";
import { FUENTE_URL } from "@/lib/atribucion";

export function ItemsList({ items }: { items: CheckItem[] }) {
  return (
    <ul className="divide-y divide-line-soft">
      {items.map((it) => (
        <li key={it.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2 text-sm">
          <p className="font-medium leading-snug min-w-0" title={it.detail}>{it.label}</p>
          <span className="num font-semibold text-right truncate max-w-[10rem]">{it.value}</span>
          <span className="text-xs font-bold uppercase tracking-wider w-20 text-right" style={{ color: it.pass === true ? "var(--sig-strong)" : it.pass === false ? "var(--sig-avoid)" : "var(--ink-soft)" }}>
            {it.pass === true ? "Cumple" : it.pass === false ? "No cumple" : "Sin dato"}
          </span>
        </li>
      ))}
    </ul>
  );
}

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const fechaCorta = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d} ${MESES[m - 1]}` : iso;
};

/** Interés en corto de FINRA: cuántas acciones están vendidas en corto y cuánto tardarían en cerrarse. */
function FinraShort({ si }: { si: ShortInterest }) {
  const alto = isNum(si.daysToCover) && si.daysToCover >= 5;
  return (
    <div className="mb-4 rounded-xl border border-line-soft p-3 text-sm">
      <p className="text-[0.65rem] uppercase tracking-wider font-bold text-ink-soft">Interés en corto · FINRA · {fechaCorta(si.settlementDate)}</p>
      <p className="mt-1">
        <span className="num font-bold">{fmtBig(si.shortQty, 1, "")}</span> acciones en corto
        {isNum(si.daysToCover) && (
          <>
            {" · "}
            <span className="num font-bold" style={alto ? { color: "var(--sig-avoid)" } : undefined}>{si.daysToCover.toFixed(1)}</span> días para cubrir
          </>
        )}
        {isNum(si.changePct) && (
          <span className="text-ink-soft">
            {" · "}
            {si.changePct > 0 ? "+" : ""}
            {si.changePct.toFixed(1)}% vs. quincena anterior
          </span>
        )}
      </p>
      <p className="text-xs text-ink-soft mt-1">
        Días para cubrir = sesiones de volumen normal que harían falta para cerrar todos los cortos. Desde 5 es alto: más presión bajista y más riesgo de rebotes bruscos.{" "}
        <a href={FUENTE_URL.xoomarShortInterest} target="_blank" rel="noopener noreferrer" className="underline hover:text-terracotta">
          Datos: XOOMAR
        </a>
      </p>
    </div>
  );
}

/** Ánimo del día en r/wallstreetbets. Solo aparece si la acción está entre las más comentadas. */
function WsbLine({ w }: { w: WsbSentiment }) {
  const alcista = /bull/i.test(w.sentiment);
  return (
    <p className="mt-4 pt-3 border-t border-line-soft text-sm">
      <span className="text-[0.65rem] uppercase tracking-wider font-bold text-ink-soft">WallStreetBets hoy</span>
      <br />
      <span className="font-bold" style={{ color: alcista ? "var(--sig-strong)" : "var(--sig-avoid)" }}>
        {alcista ? "Alcista" : "Bajista"}
      </span>{" "}
      <span className="text-ink-soft">
        · {w.comments} comentarios · la #{w.rank} más comentada de {w.of}. Es el ánimo de un foro de inversionistas minoristas, no un dato del negocio.{" "}
        <a href={FUENTE_URL.wsb} target="_blank" rel="noopener noreferrer" className="underline hover:text-terracotta">
          Fuente
        </a>
      </span>
    </p>
  );
}

export function RiskCard({ risk, shortInterest }: { risk: RiskResult; shortInterest?: ShortInterest | null }) {
  const lvlColor = risk.level === "Bajo" ? "var(--sig-strong)" : risk.level === "Medio" ? "var(--sig-watch)" : "var(--sig-avoid)";
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <Eyebrow>Risk</Eyebrow>
        <span className="pill" style={{ background: lvlColor, color: risk.level === "Medio" ? "var(--ink)" : "var(--cream)" }}>
          Riesgo {risk.level.toLowerCase()}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3 my-4">
        {[
          ["Beta", isNum(risk.beta) ? risk.beta.toFixed(2) : "—"],
          ["Volatilidad 1a", fmtPct(risk.volatility1y, 0)],
          ["Máx. caída 5a", fmtPct(risk.maxDrawdown5y, 0)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-cream-2/70 p-3 text-center">
            <p className="text-[0.65rem] uppercase tracking-wider font-bold text-ink-soft">{k}</p>
            <p className="num font-display text-xl">{v}</p>
          </div>
        ))}
      </div>
      {risk.eventRisk.warn && <p className="mb-3 text-sm rounded-xl bg-terracotta-tint text-terracotta-deep p-3 font-medium">⚠︎ Earnings en {risk.eventRisk.daysUntil} días. No ampliar antes del evento.</p>}
      {shortInterest && <FinraShort si={shortInterest} />}
      <ItemsList items={risk.items.filter((i) => i.pass !== null)} />
    </Card>
  );
}

export function PeersCard({ peers, symbol }: { peers: PeersResult; symbol: string }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-5 pb-3 flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Peers</Eyebrow>
          <p className="text-sm mt-1">{peers.summary}</p>
        </div>
        <VerdictPill v={peers.verdict} />
      </div>
      <div className="scroll-x">
        <table className="table text-[0.82rem] min-w-[640px]">
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="num">Cap.</th>
              <th className="num">P/E</th>
              <th className="num">Fwd P/E</th>
              <th className="num">PEG</th>
              <th className="num">P/S</th>
              <th className="num">M. bruto</th>
              <th className="num">M. oper.</th>
              <th className="num">ROE</th>
              <th className="num">Crec. ing.</th>
            </tr>
          </thead>
          <tbody>
            {peers.rows.map((r) => (
              <tr key={r.symbol} className={r.isSubject ? "bg-terracotta-tint/70 font-semibold" : ""}>
                <td>
                  {r.isSubject ? (
                    <span>{r.symbol}</span>
                  ) : (
                    <Link href={`/accion/${r.symbol}`} className="hover:text-terracotta font-semibold">
                      {r.symbol}
                    </Link>
                  )}
                  <div className="text-[0.68rem] text-ink-soft font-normal truncate max-w-[9rem]">{r.name}</div>
                </td>
                <td className="num">{fmtBig(r.marketCap, 1)}</td>
                <td className="num">{fmtX(r.pe)}</td>
                <td className="num">{fmtX(r.forwardPe)}</td>
                <td className="num">{isNum(r.peg) && r.peg > 0 && r.peg < 10 ? r.peg.toFixed(2) : "n.s."}</td>
                <td className="num">{fmtX(r.ps)}</td>
                <td className="num">{fmtPct(r.grossMargin, 0)}</td>
                <td className="num">{fmtPct(r.operatingMargin, 0)}</td>
                <td className="num">{fmtPct(r.roe, 0)}</td>
                <td className="num">{fmtPct(r.revenueGrowthTTM, 0, true)}</td>
              </tr>
            ))}
            <tr className="text-ink-soft">
              <td>{peers.market.name}</td>
              <td />
              <td className="num">{fmtX(peers.market.pe)}</td>
              <td className="num">{fmtX(peers.market.forwardPe)}</td>
              <td colSpan={6} className="text-[0.7rem]">
                referencia aproximada del índice (ajustable en variables de entorno)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="p-5 pt-3">
        <ItemsList items={peers.items.filter((i) => i.pass !== null)} />
        <p className="text-xs text-ink-soft mt-1">
          <Link href={`/comparar?t=${[symbol, ...peers.rows.filter((r) => !r.isSubject).map((r) => r.symbol)].join(",")}`} className="text-terracotta font-semibold hover:underline">
            Comparar en detalle →
          </Link>
        </p>
      </div>
    </Card>
  );
}

const sentColor: Record<SentLabel, { bg: string; fg: string; es: string }> = {
  Bullish: { bg: "var(--sig-strong)", fg: "var(--cream)", es: "Alcista" },
  "Somewhat-Bullish": { bg: "var(--sig-good)", fg: "var(--cream)", es: "Algo alcista" },
  Neutral: { bg: "var(--cream-2)", fg: "var(--ink-soft)", es: "Neutral" },
  "Somewhat-Bearish": { bg: "var(--sig-wait)", fg: "var(--cream)", es: "Algo bajista" },
  Bearish: { bg: "var(--sig-avoid)", fg: "var(--cream)", es: "Bajista" },
};

function SentPill({ l, score }: { l: SentLabel; score?: number }) {
  const s = sentColor[l];
  return (
    <span className="pill text-[0.68rem]" style={{ background: s.bg, color: s.fg }}>
      {s.es}
      {isNum(score) && <span className="opacity-80 num">{score >= 0 ? "+" : ""}{score.toFixed(2)}</span>}
    </span>
  );
}

function NewsRow({ n }: { n: NewsItem }) {
  return (
    <li className="py-3 border-b border-line-soft last:border-none">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-medium leading-snug hover:text-terracotta">
            {n.title}
          </a>
          <p className="text-xs text-ink-soft mt-1">
            {n.source} · <TimeAgo ts={n.publishedAt} />
            {n.topics.length > 0 && <> · {n.topics.join(" · ")}</>}
          </p>
        </div>
        <SentPill l={n.sentiment.label} score={n.sentiment.score} />
      </div>
    </li>
  );
}

export function NewsCard({ s, wsb }: { s: SentimentResult; wsb?: WsbSentiment | null }) {
  const [filter, setFilter] = useState<"all" | "bull" | "bear">("all");
  const list = s.news.filter((n) => (filter === "all" ? true : filter === "bull" ? n.sentiment.score >= 0.15 : n.sentiment.score <= -0.15));
  const agg = sentColor[s.aggregate.label];
  return (
    <section id="noticias">
      <div className="mb-3 flex items-end justify-between gap-3 flex-wrap">
        <Eyebrow>Sentiment · {s.news.length} titulares · 30 días</Eyebrow>
        <span className="pill text-sm px-4 py-2" style={{ background: agg.bg, color: agg.fg }}>
          {agg.es} · {s.aggregate.score >= 0 ? "+" : ""}
          {s.aggregate.score.toFixed(2)}
        </span>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4">
        <div className="space-y-4">
          <Card>
            <p className="text-sm">{s.summary}</p>
            <div className="flex gap-3 mt-3 text-sm">
              <span className="font-bold" style={{ color: "var(--sig-strong)" }}>
                ▲ {s.aggregate.bullish} alcistas
              </span>
              <span className="text-ink-soft">● {s.aggregate.neutral} neutrales</span>
              <span className="font-bold" style={{ color: "var(--sig-avoid)" }}>
                ▼ {s.aggregate.bearish} bajistas
              </span>
            </div>
            {s.topics.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {s.topics.map((t) => (
                  <span key={t.topic} className="pill border border-line text-ink" title={`sentimiento promedio ${t.avgScore.toFixed(2)}`}>
                    <span className="w-2 h-2 rounded-full" style={{ background: t.avgScore >= 0.15 ? "var(--sig-strong)" : t.avgScore <= -0.15 ? "var(--sig-avoid)" : "var(--line)" }} />
                    {t.topic} · {t.count}
                  </span>
                ))}
              </div>
            )}
            {wsb && <WsbLine w={wsb} />}
            <ItemsList items={s.items.filter((i) => i.pass !== null)} />
          </Card>
          {(s.drivers.bullish.length > 0 || s.drivers.bearish.length > 0) && (
            <Card>
              <Eyebrow>Lo que más pesa</Eyebrow>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--sig-strong)" }}>
                    A favor
                  </p>
                  <ul className="mt-1 space-y-2 text-sm">
                    {s.drivers.bullish.map((n) => (
                      <li key={n.id}>
                        <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:text-terracotta leading-snug">
                          {n.title}
                        </a>
                      </li>
                    ))}
                    {!s.drivers.bullish.length && <li className="text-ink-soft">—</li>}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--sig-avoid)" }}>
                    En contra
                  </p>
                  <ul className="mt-1 space-y-2 text-sm">
                    {s.drivers.bearish.map((n) => (
                      <li key={n.id}>
                        <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:text-terracotta leading-snug">
                          {n.title}
                        </a>
                      </li>
                    ))}
                    {!s.drivers.bearish.length && <li className="text-ink-soft">—</li>}
                  </ul>
                </div>
              </div>
            </Card>
          )}
        </div>
        <Card className="p-0 overflow-hidden">
          <div className="flex items-center gap-1 p-3 border-b border-line-soft">
            {(
              [
                ["all", `Todas (${s.news.length})`],
                ["bull", `Alcistas (${s.aggregate.bullish})`],
                ["bear", `Bajistas (${s.aggregate.bearish})`],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} className={`pill ${filter === k ? "bg-ink text-cream" : "border border-line text-ink"}`} aria-pressed={filter === k}>
                {l}
              </button>
            ))}
          </div>
          <ul className="px-4 max-h-[640px] overflow-y-auto">
            {list.slice(0, 12).map((n) => (
              <NewsRow key={n.id} n={n} />
            ))}
            {!list.length && <li className="py-6 text-sm text-ink-soft text-center">Sin titulares en esta categoría.</li>}
          </ul>
        </Card>
      </div>
    </section>
  );
}

/* ── Peter Lynch ─────────────────────────────────────────────────── */
export function LynchCard({ lynch, price }: { lynch: import("@/lib/analysis/lynch").LynchResult; price: number }) {
  const fv = lynch.fairValue;
  const up = isNum(fv) ? ((fv - price) / price) * 100 : null;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Eyebrow>Peter Lynch · buy what you know</Eyebrow>
          <h3 className="font-display text-2xl">{lynch.category}</h3>
          <p className="text-sm text-ink-soft mt-1">{lynch.categoryNote}</p>
        </div>
        <VerdictPill v={lynch.verdict} />
      </div>
      <div className="grid grid-cols-3 gap-3 my-4">
        {[
          ["PEG", isNum(lynch.peg) && lynch.peg > 0 && lynch.peg < 10 ? lynch.peg.toFixed(2) : "n.s."],
          ["PEG + dividendo", isNum(lynch.pegAdjusted) ? lynch.pegAdjusted.toFixed(2) : "—"],
          ["Fair Value Lynch", isNum(fv) ? `${fmtMoney(fv)}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-cream-2/70 p-3 text-center">
            <p className="text-[0.65rem] uppercase tracking-wider font-bold text-ink-soft">{k}</p>
            <p className="num font-display text-xl">{v}</p>
          </div>
        ))}
      </div>
      {isNum(up) && (
        <p className="text-sm mb-3">
          P/E justo {fmtX(lynch.fairPe, 0)} × EPS → <b className="num">{fmtPct(up, 0, true)}</b> vs precio · crecimiento {fmtPct(lynch.growthUsed, 0)}
        </p>
      )}
      <ItemsList items={lynch.items.filter((i) => i.pass !== null)} />
    </Card>
  );
}
