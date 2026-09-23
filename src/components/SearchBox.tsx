"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Hit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export function SearchBox({ compact = false, autoFocus = false, onSelect, placeholder }: { compact?: boolean; autoFocus?: boolean; onSelect?: (symbol: string) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.trim().length < 1) {
      setHits([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        const d = (await r.json()) as { hits: Hit[] };
        setHits(d.hits ?? []);
        setIdx(0);
        setOpen(true);
      } catch {
        /* abort */
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (sym: string) => {
    setOpen(false);
    setQ("");
    if (onSelect) onSelect(sym.toUpperCase());
    else router.push(`/accion/${encodeURIComponent(sym)}`);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[idx]) go(hits[idx].symbol);
      else if (q.trim()) go(q.trim().toUpperCase());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <label className="sr-only" htmlFor={compact ? "search-compact" : "search-main"}>
        Buscar acción por ticker o nombre
      </label>
      <div className="relative">
        <svg className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${compact ? "w-4 h-4" : "w-5 h-5"} opacity-60`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          id={compact ? "search-compact" : "search-main"}
          className={compact ? "w-full bg-[#33312b] text-cream placeholder:text-[#a9a296] rounded-full pl-10 pr-4 py-2 text-sm border border-[#4a4740] focus:border-terracotta focus:outline-none" : "input text-lg py-4"}
          style={compact ? undefined : { paddingLeft: "3rem" }}
          placeholder={placeholder ?? (compact ? "Buscar ticker…  NVDA, MSFT, META" : "Escribe un ticker o nombre: NVDA, Microsoft, Costco…")}
          value={q}
          autoFocus={autoFocus}
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          onKeyDown={onKey}
          aria-expanded={open}
          aria-controls="search-results"
          role="combobox"
        />
        {loading && <span className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-terracotta border-t-transparent animate-spin" aria-hidden />}
      </div>
      {open && hits.length > 0 && (
        <ul id="search-results" role="listbox" className="absolute z-[60] mt-2 w-full card overflow-hidden text-ink" style={{ boxShadow: "0 18px 40px -16px rgba(34,33,29,.45)" }}>
          {hits.map((h, i) => (
            <li key={h.symbol} role="option" aria-selected={i === idx}>
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(h.symbol)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === idx ? "bg-terracotta-tint" : ""}`}
              >
                <span className="font-bold tabular w-16 shrink-0">{h.symbol}</span>
                <span className="flex-1 truncate text-sm">{h.name}</span>
                <span className="text-xs text-ink-soft shrink-0">{h.type === "ETF" ? "ETF" : h.exchange}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
