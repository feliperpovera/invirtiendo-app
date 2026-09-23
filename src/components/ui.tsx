import type { Verdict, SignalKey } from "@/lib/analysis/types";

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

export function Card({ children, className = "", ink = false, id }: { children: React.ReactNode; className?: string; ink?: boolean; id?: string }) {
  return (
    <section id={id} className={`${ink ? "card-ink" : "card"} p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export const verdictStyle: Record<Verdict, { bg: string; fg: string; icon: string; text: string }> = {
  PASA: { bg: "var(--sig-strong)", fg: "var(--cream)", icon: "", text: "Cumple" },
  DUDOSO: { bg: "var(--sig-watch)", fg: "var(--ink)", icon: "", text: "Sin dato" },
  FALLA: { bg: "var(--sig-avoid)", fg: "var(--cream)", icon: "", text: "No cumple" },
};

export function VerdictPill({ v, size = "md" }: { v: Verdict; size?: "sm" | "md" }) {
  const s = verdictStyle[v];
  return (
    <span className={`pill ${size === "sm" ? "text-[0.7rem] px-2.5 py-1" : ""}`} style={{ background: s.bg, color: s.fg }}>
      {s.text}
    </span>
  );
}

export const signalColor: Record<SignalKey, string> = {
  strong: "var(--sig-strong)",
  good: "var(--sig-good)",
  watch: "var(--sig-watch)",
  wait: "var(--sig-wait)",
  avoid: "var(--sig-avoid)",
  discard: "var(--sig-avoid)",
};

export function SignalPill({ k, label, big = false }: { k: SignalKey; label: string; big?: boolean }) {
  const dark = k === "watch";
  return (
    <span className={`pill ${big ? "text-sm px-4 py-2" : ""}`} style={{ background: signalColor[k], color: dark ? "var(--ink)" : "var(--cream)" }}>
      {label}
    </span>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad" | "muted" }) {
  const color = tone === "good" ? "var(--sig-strong)" : tone === "bad" ? "var(--sig-avoid)" : undefined;
  return (
    <div className="min-w-0">
      <p className="text-[0.7rem] uppercase tracking-[0.12em] font-bold text-ink-soft">{label}</p>
      <p className="num text-lg sm:text-xl font-bold leading-tight mt-0.5" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-xs text-ink-soft mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

/** Cumple / No cumple / Sin dato en texto: sin iconos ni casillas, el veredicto se lee. */
export function PassDot({ pass }: { pass: boolean | null }) {
  const color = pass === true ? "var(--sig-strong)" : pass === false ? "var(--sig-avoid)" : "var(--ink-soft)";
  return (
    <span className="text-[0.68rem] font-bold uppercase tracking-wider shrink-0 whitespace-nowrap" style={{ color }}>
      {pass === true ? "Cumple" : pass === false ? "No cumple" : "Sin dato"}
    </span>
  );
}

export function Delta({ v, digits = 2, suffix = "%" }: { v: number | null | undefined; digits?: number; suffix?: string }) {
  if (v === null || v === undefined || !Number.isFinite(v)) return <span className="text-ink-soft">—</span>;
  const color = v > 0 ? "var(--sig-strong)" : v < 0 ? "var(--sig-avoid)" : "var(--ink-soft)";
  return (
    <span className="num font-semibold" style={{ color }}>
      {v > 0 ? "+" : ""}
      {v.toFixed(digits)}
      {suffix}
    </span>
  );
}
