"use client";

/**
 * Watchlist y notas en el navegador (localStorage). Sin cuentas ni servidor:
 * cada persona guarda su lista en su dispositivo. Exportable a JSON.
 * Implementado con useSyncExternalStore para hidratación segura (SSR).
 */
import { useCallback, useSyncExternalStore } from "react";
import type { SignalKey } from "./analysis/types";
import { isNum } from "./format";

export interface Lot {
  id: string;
  date: string; // YYYY-MM-DD
  qty: number;
  price: number;
}

export interface WatchItem {
  symbol: string;
  name?: string;
  addedAt: number;
  fairValue: number | null;
  zoneGradual: number | null;
  zoneStrong: number | null;
  signal?: SignalKey;
  signalLabel?: string;
  score?: number;
  buffettPassed?: number;
  profile?: "nucleo" | "satelite";
  lots: Lot[];
  notes?: string;
}

export type Tri = "yes" | "no" | undefined;
export interface TickerNotes {
  checks: Record<string, Tri>; // clave: `${filterKey}:${itemKey}`
  thesis: { why: string; moat: string; breaker: string };
  updatedAt: number;
}

const WL_KEY = "invirtiendo.watchlist.v1";
const NOTES_KEY = "invirtiendo.notes.v1";
const EVT = "invirtiendo:storage";

function readRaw(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write<T>(key: string, v: T) {
  try {
    window.localStorage.setItem(key, JSON.stringify(v));
    window.dispatchEvent(new CustomEvent(EVT, { detail: key }));
  } catch {
    /* modo privado o cuota llena */
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

/* ── Snapshots memoizados (referencia estable mientras no cambie el JSON) ── */
const EMPTY_WL: WatchItem[] = [];
let wlCache: { raw: string | null; items: WatchItem[] } = { raw: null, items: EMPTY_WL };
function wlSnapshot(): WatchItem[] {
  const raw = readRaw(WL_KEY);
  if (raw !== wlCache.raw) {
    let items: WatchItem[] = EMPTY_WL;
    try {
      items = raw ? (JSON.parse(raw) as WatchItem[]) : EMPTY_WL;
    } catch {
      items = EMPTY_WL;
    }
    wlCache = { raw, items };
  }
  return wlCache.items;
}

const EMPTY_NOTES: TickerNotes = { checks: {}, thesis: { why: "", moat: "", breaker: "" }, updatedAt: 0 };
let notesCache: { raw: string | null; all: Record<string, TickerNotes> } = { raw: null, all: {} };
function notesAll(): Record<string, TickerNotes> {
  const raw = readRaw(NOTES_KEY);
  if (raw !== notesCache.raw) {
    let all: Record<string, TickerNotes> = {};
    try {
      all = raw ? (JSON.parse(raw) as Record<string, TickerNotes>) : {};
    } catch {
      all = {};
    }
    notesCache = { raw, all };
  }
  return notesCache.all;
}

export function loadWatchlist(): WatchItem[] {
  return wlSnapshot();
}
export function saveWatchlist(items: WatchItem[]) {
  write(WL_KEY, items);
}

const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

export function useWatchlist() {
  const items = useSyncExternalStore(subscribe, wlSnapshot, () => EMPTY_WL);
  const ready = useSyncExternalStore(subscribe, hydratedSnapshot, serverSnapshot);
  const upsert = useCallback((item: Partial<WatchItem> & { symbol: string }) => {
    const cur = [...loadWatchlist()];
    const i = cur.findIndex((x) => x.symbol === item.symbol);
    if (i >= 0) cur[i] = { ...cur[i], ...item, lots: item.lots ?? cur[i].lots };
    else cur.push({ addedAt: Date.now(), fairValue: null, zoneGradual: null, zoneStrong: null, lots: [], ...item });
    saveWatchlist(cur);
  }, []);
  const remove = useCallback((symbol: string) => saveWatchlist(loadWatchlist().filter((x) => x.symbol !== symbol)), []);
  const addLot = useCallback((symbol: string, lot: Omit<Lot, "id">) => {
    const cur = loadWatchlist().map((x) => (x.symbol === symbol ? { ...x, lots: [...x.lots, { ...lot, id: Math.random().toString(36).slice(2, 9) }].sort((a, b) => a.date.localeCompare(b.date)) } : x));
    saveWatchlist(cur);
  }, []);
  const removeLot = useCallback((symbol: string, id: string) => {
    saveWatchlist(loadWatchlist().map((x) => (x.symbol === symbol ? { ...x, lots: x.lots.filter((l) => l.id !== id) } : x)));
  }, []);
  const has = useCallback((symbol: string) => items.some((x) => x.symbol === symbol), [items]);
  return { items, ready, upsert, remove, addLot, removeLot, has };
}

/* ── Notas por ticker (checks cualitativos + tesis) ───────────────── */
export function loadNotes(symbol: string): TickerNotes {
  return notesAll()[symbol] ?? EMPTY_NOTES;
}
export function saveNotes(symbol: string, n: TickerNotes) {
  const all = { ...notesAll(), [symbol]: { ...n, updatedAt: Date.now() } };
  write(NOTES_KEY, all);
}
export function useNotes(symbol: string) {
  const notes = useSyncExternalStore(subscribe, () => loadNotes(symbol), () => EMPTY_NOTES);
  const update = useCallback(
    (patch: Partial<TickerNotes>) => {
      const prev = loadNotes(symbol);
      const next: TickerNotes = { ...prev, ...patch, checks: { ...prev.checks, ...(patch.checks ?? {}) }, thesis: { ...prev.thesis, ...(patch.thesis ?? {}) } };
      saveNotes(symbol, next);
    },
    [symbol],
  );
  return { notes, update };
}

/* ── Matemática de posiciones (del glosario: EM/EA) ──────────────── */
export interface PositionStats {
  qty: number;
  invested: number;
  avgCost: number | null;
  marketValue: number | null;
  pnl: number | null;
  returnPct: number | null;
  days: number | null;
  em: number | null; // efectiva mensual %
  ea: number | null; // efectiva anual %
}

export function positionStats(lots: Lot[], price: number | null): PositionStats {
  const qty = lots.reduce((s, l) => s + l.qty, 0);
  const invested = lots.reduce((s, l) => s + l.qty * l.price, 0);
  const avgCost = qty > 0 ? invested / qty : null;
  const marketValue = isNum(price) && qty > 0 ? qty * price : null;
  const pnl = isNum(marketValue) ? marketValue - invested : null;
  const r = isNum(pnl) && invested > 0 ? pnl / invested : null;
  let days: number | null = null;
  if (invested > 0 && lots.length) {
    const now = Date.now();
    days = lots.reduce((s, l) => s + ((now - new Date(l.date).getTime()) / 86400000) * ((l.qty * l.price) / invested), 0);
    days = Math.max(1, days);
  }
  const em = isNum(r) && isNum(days) ? (Math.pow(1 + r, 30 / days) - 1) * 100 : null;
  const ea = isNum(r) && isNum(days) ? (Math.pow(1 + r, 365 / days) - 1) * 100 : null;
  return { qty, invested, avgCost, marketValue, pnl, returnPct: isNum(r) ? r * 100 : null, days, em, ea };
}

export function exportJson(): string {
  return JSON.stringify({ watchlist: loadWatchlist(), notes: notesAll(), exportedAt: new Date().toISOString() }, null, 2);
}
export function importJson(raw: string): boolean {
  try {
    const d = JSON.parse(raw) as { watchlist?: WatchItem[]; notes?: Record<string, TickerNotes> };
    if (Array.isArray(d.watchlist)) saveWatchlist(d.watchlist);
    if (d.notes && typeof d.notes === "object") write(NOTES_KEY, d.notes);
    return true;
  } catch {
    return false;
  }
}
