"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWatchlist, positionStats, exportJson, importJson, type WatchItem } from "@/lib/watchlist";
import type { Quote } from "@/lib/analysis/types";
import { fmtMoney, fmtPct, fmtBig, isNum, timeAgo } from "@/lib/format";
import { Card, Eyebrow, SignalPill, Delta } from "./ui";
import { RangeBar } from "@/components/charts";

function useQuotes(symbols: string[]) {
  const [q, setQ] = useState<Record<string, Quote | null>>({});
  const [asOf, setAsOf] = useState<number | null>(null);
  const key = symbols.join(",");
  useEffect(() => {
    if (!key) return;
    let alive = true;
    const load = () =>
      fetch(`/api/quote?symbols=${encodeURIComponent(key)}`)
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          setQ(j.quotes ?? {});
          setAsOf(j.asOf ?? Date.now());
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [key]);
  return { quotes: q, asOf };
}

function LotForm({ onAdd }: { onAdd: (l: { date: string; qty: number; price: number }) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const q = Number(qty);
        const p = Number(price);
        if (q > 0 && p > 0) {
          onAdd({ date, qty: q, price: p });
          setQty("");
          setPrice("");
        }
      }}
    >
      <label className="flex flex-col gap-1 text-xs">
        Fecha
        <input type="date" className="input py-1.5 px-2 text-sm w-36" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Acciones
        <input type="number" step="any" min="0" className="input py-1.5 px-2 text-sm w-24" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="10" required />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Precio
        <input type="number" step="any" min="0" className="input py-1.5 px-2 text-sm w-28" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="182.50" required />
      </label>
      <button className="btn btn-ink py-1.5 px-3 text-xs" type="submit">
        Agregar tramo
      </button>
    </form>
  );
}

function Row({ it, q, onRemove, onAddLot, onRemoveLot }: { it: WatchItem; q: Quote | null | undefined; onRemove: () => void; onAddLot: (l: { date: string; qty: number; price: number }) => void; onRemoveLot: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const price = q?.price ?? null;
  const st = positionStats(it.lots, price);
  const distGradual = isNum(price) && isNum(it.zoneGradual) ? (it.zoneGradual / price - 1) * 100 : null;
  const inZone = isNum(distGradual) && distGradual >= 0;
  return (
    <>
      <tr className={inZone ? "bg-olive-tint/60" : ""}>
        <td>
          <Link href={`/accion/${it.symbol}`} className="font-bold hover:text-terracotta">
            {it.symbol}
          </Link>
          <div className="text-xs text-ink-soft truncate max-w-[10rem]">{it.name ?? ""}</div>
        </td>
        <td className="num">
          {isNum(price) ? fmtMoney(price) : <span className="skeleton inline-block w-16 h-4" />}
          <div className="text-xs">
            <Delta v={q?.changePct ?? null} />
          </div>
        </td>
        <td>
          <RangeBar label="día" low={q?.low ?? null} high={q?.high ?? null} price={price} compact />
        </td>
        <td>
          <RangeBar label="52 sem" low={q?.low52 ?? null} high={q?.high52 ?? null} price={price} compact />
        </td>
        <td>{it.signal && it.signalLabel ? <SignalPill k={it.signal} label={it.signalLabel} /> : <span className="text-ink-soft">—</span>}</td>
        <td className="num">
          {fmtMoney(it.fairValue)}
          <div className="text-xs text-ink-soft">zona {fmtMoney(it.zoneGradual, 0)} · fuerte {fmtMoney(it.zoneStrong, 0)}</div>
        </td>
        <td className="num">
          {isNum(distGradual) ? (
            <span className="font-semibold" style={{ color: inZone ? "var(--sig-strong)" : "var(--ink)" }}>
              {inZone ? "En zona" : `falta ${fmtPct(-distGradual, 1)}`}
            </span>
          ) : (
            "—"
          )}
        </td>
        <td className="num">
          {st.qty > 0 ? (
            <>
              {st.qty} acc · {fmtMoney(st.avgCost)}
              <div className="text-xs text-ink-soft">{fmtBig(st.invested, 0)} invertidos</div>
            </>
          ) : (
            <span className="text-ink-soft">Sin posición</span>
          )}
        </td>
        <td className="num">
          {st.qty > 0 ? (
            <>
              <Delta v={st.returnPct} digits={1} />
              <div className="text-xs text-ink-soft">
                {fmtBig(st.pnl, 0)} · EM {fmtPct(st.em, 2)} · EA {fmtPct(st.ea, 1)}
              </div>
            </>
          ) : (
            "—"
          )}
        </td>
        <td className="text-right whitespace-nowrap">
          <button className="btn btn-ghost py-1 px-3 text-xs mr-1" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Cerrar" : "Tramos"}
          </button>
          <button className="btn btn-ghost py-1 px-3 text-xs" onClick={onRemove} aria-label={`Quitar ${it.symbol}`}>
            Quitar
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="bg-cream-2/50">
            <div className="flex flex-col gap-3 py-1">
              {it.lots.length > 0 && (
                <table className="text-sm w-auto">
                  <thead>
                    <tr className="text-xs text-ink-soft">
                      <th className="text-left pr-4 font-semibold">Fecha</th>
                      <th className="text-right pr-4 font-semibold">Acciones</th>
                      <th className="text-right pr-4 font-semibold">Precio</th>
                      <th className="text-right pr-4 font-semibold">Total</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {it.lots.map((l) => (
                      <tr key={l.id}>
                        <td className="pr-4 py-0.5">{l.date}</td>
                        <td className="pr-4 text-right num">{l.qty}</td>
                        <td className="pr-4 text-right num">{fmtMoney(l.price)}</td>
                        <td className="pr-4 text-right num">{fmtMoney(l.qty * l.price)}</td>
                        <td>
                          <button className="text-xs text-terracotta hover:underline" onClick={() => onRemoveLot(l.id)}>
                            eliminar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <LotForm onAdd={onAddLot} />
              <p className="text-xs text-ink-soft">EM = (1+r)^(30/días) − 1 · EA = (1+r)^(365/días) − 1 · días ponderados por capital. El objetivo de los tramos es bajar el costo promedio en las caídas.</p>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function WatchlistTable({ preview = false }: { preview?: boolean }) {
  const { items, ready, remove, addLot, removeLot } = useWatchlist();
  const symbols = useMemo(() => items.map((i) => i.symbol), [items]);
  const { quotes, asOf } = useQuotes(symbols);
  const [msg, setMsg] = useState<string | null>(null);

  const totals = useMemo(() => {
    let invested = 0;
    let value = 0;
    for (const it of items) {
      const st = positionStats(it.lots, quotes[it.symbol]?.price ?? null);
      invested += st.invested;
      value += st.marketValue ?? st.invested;
    }
    return { invested, value, pnl: value - invested, pct: invested > 0 ? ((value - invested) / invested) * 100 : null };
  }, [items, quotes]);

  if (!ready) return <div className="skeleton h-40" />;
  if (!items.length) {
    return (
      <Card className="text-center py-10">
        <Eyebrow>Tu watchlist está vacía</Eyebrow>
        <h3 className="font-display text-2xl mt-2">No se compra por estar en la lista. Se compra si llega a la zona.</h3>
        <p className="text-ink-soft mt-2 max-w-md mx-auto">Evalúa una acción y pulsa «Agregar a watchlist»: guardaremos su fair value, la buy zone y tu tesis para vigilarla con precios en vivo.</p>
        <Link href="/" className="btn btn-primary mt-5">
          Evaluar una acción
        </Link>
      </Card>
    );
  }
  const shown = preview ? items.slice(0, 6) : items;
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
        <div>
          <Eyebrow>Watchlist · {items.length} acciones</Eyebrow>
          {totals.invested > 0 && (
            <p className="text-sm mt-1">
              Invertido {fmtBig(totals.invested, 0)} · valor {fmtBig(totals.value, 0)} · <Delta v={totals.pct} digits={1} /> ({fmtBig(totals.pnl, 0)})
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-soft">
          {asOf && <span>Precios {timeAgo(asOf)}</span>}
          {!preview && (
            <>
              <button
                className="btn btn-ghost py-1 px-3 text-xs"
                onClick={async () => {
                  await navigator.clipboard.writeText(exportJson());
                  setMsg("Copiado al portapapeles (JSON)");
                  setTimeout(() => setMsg(null), 2500);
                }}
              >
                Exportar
              </button>
              <button
                className="btn btn-ghost py-1 px-3 text-xs"
                onClick={() => {
                  const raw = window.prompt("Pega aquí el JSON exportado:");
                  if (raw) setMsg(importJson(raw) ? "Importado" : "JSON inválido");
                  setTimeout(() => setMsg(null), 2500);
                }}
              >
                Importar
              </button>
            </>
          )}
          {msg && <span className="text-olive-deep font-semibold">{msg}</span>}
        </div>
      </div>
      <div className="scroll-x">
        <table className="table min-w-[1120px]">
          <thead>
            <tr>
              <th>Acción</th>
              <th className="num">Precio</th>
              <th>Rango día</th>
              <th>Rango 52 sem</th>
              <th>Señal</th>
              <th className="num">Fair Value · zona</th>
              <th className="num">Distancia a zona</th>
              <th className="num">Posición</th>
              <th className="num">Rentabilidad</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((it) => (
              <Row key={it.symbol} it={it} q={quotes[it.symbol]} onRemove={() => remove(it.symbol)} onAddLot={(l) => addLot(it.symbol, l)} onRemoveLot={(id) => removeLot(it.symbol, id)} />
            ))}
          </tbody>
        </table>
      </div>
      {preview && items.length > shown.length && (
        <div className="px-5 py-3 text-sm">
          <Link href="/watchlist" className="font-semibold text-terracotta hover:underline">
            Ver las {items.length} acciones →
          </Link>
        </div>
      )}
    </Card>
  );
}
