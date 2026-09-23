"use client";

import { useState } from "react";
import type { BuffettFilter, CheckItem, Verdict } from "@/lib/analysis/types";
import { Eyebrow } from "@/components/ui";

/** Sin iconos ni casillas: la palabra dice si cumple o no. */
const TEXTO: Record<Verdict, { t: string; c: string }> = {
  PASA: { t: "Cumple", c: "var(--sig-strong)" },
  FALLA: { t: "No cumple", c: "var(--sig-avoid)" },
  DUDOSO: { t: "Sin dato", c: "var(--ink-soft)" },
};
const cumple = (pass: boolean | null) => (pass === true ? TEXTO.PASA : pass === false ? TEXTO.FALLA : TEXTO.DUDOSO);

function ItemRow({ it }: { it: CheckItem }) {
  const c = cumple(it.pass);
  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2 border-b border-line-soft last:border-none text-sm">
      <span className="min-w-0 leading-snug">{it.label}</span>
      <span className="num font-semibold text-right truncate max-w-[10rem]" title={it.detail}>
        {it.value}
      </span>
      <span className="text-xs font-bold uppercase tracking-wider w-20 text-right" style={{ color: c.c }}>
        {c.t}
      </span>
    </li>
  );
}

function FilterRow({ f }: { f: BuffettFilter }) {
  const [open, setOpen] = useState(f.verdict !== "PASA");
  const c = TEXTO[f.verdict];
  return (
    <article className="card overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-4 px-4 py-3 text-left" aria-expanded={open}>
        <span className="font-display text-3xl leading-none w-12 shrink-0 tabular" style={{ color: c.c }}>
          {String(f.n).padStart(2, "0")}
        </span>
        <span className="flex-1 min-w-0">
          <span className="font-bold">{f.title}</span>
          <span className="text-ink-soft"> · {f.question}</span>
        </span>
        <span className="text-xs font-bold uppercase tracking-wider shrink-0" style={{ color: c.c }}>
          {c.t}
        </span>
        <span className={`text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
          ▾
        </span>
      </button>
      {open && f.items.length > 0 && (
        <ul className="px-4 pb-3 border-t border-line-soft">
          {f.items.map((it) => (
            <ItemRow key={it.key} it={it} />
          ))}
        </ul>
      )}
    </article>
  );
}

export function Checklist({ filters }: { filters: BuffettFilter[] }) {
  return (
    <section>
      <Eyebrow className="mb-2">6 pilares · todos medidos con datos</Eyebrow>
      <div className="space-y-2">
        {filters.map((f) => (
          <FilterRow key={f.key} f={f} />
        ))}
      </div>
    </section>
  );
}
