/** Utilidades de formato (es-CO / USD) usadas en servidor y cliente. */

export const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export function fmtMoney(v: number | null | undefined, digits = 2): string {
  if (!isNum(v)) return "—";
  return v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 1.23T · 456.7B · 12.3M · 950K */
export function fmtBig(v: number | null | undefined, digits = 1, prefix = "$"): string {
  if (!isNum(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  const f = (n: number, s: string) => `${sign}${prefix}${n.toFixed(digits)}${s}`;
  if (abs >= 1e12) return f(abs / 1e12, "T");
  if (abs >= 1e9) return f(abs / 1e9, "B");
  if (abs >= 1e6) return f(abs / 1e6, "M");
  if (abs >= 1e3) return f(abs / 1e3, "K");
  return `${sign}${prefix}${abs.toFixed(digits)}`;
}

export function fmtPct(v: number | null | undefined, digits = 1, withSign = false): string {
  if (!isNum(v)) return "—";
  // Redondear antes de decidir el signo: −0.02 con un decimal es 0.0, no "-0.0".
  const r = Number(v.toFixed(digits)) || 0;
  const s = withSign && r > 0 ? "+" : "";
  return `${s}${r.toFixed(digits)}%`;
}

/** ratio → "23.4x" */
export function fmtX(v: number | null | undefined, digits = 1): string {
  if (!isNum(v)) return "—";
  if (v < 0) return "n.s.";
  if (v > 999) return ">999x";
  return `${v.toFixed(digits)}x`;
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (!isNum(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function fmtDate(iso: string | number | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return "—";
  const d = typeof iso === "number" ? new Date(iso < 1e12 ? iso * 1000 : iso) : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CO", opts ?? { day: "2-digit", month: "short", year: "numeric" });
}

export function timeAgo(iso: string | number | Date): string {
  const d = typeof iso === "number" ? new Date(iso < 1e12 ? iso * 1000 : iso) : new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "ahora";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 30) return `hace ${Math.floor(diff / 86400)} d`;
  return fmtDate(d);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function avg(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter(isNum);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

export function median(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function stdev(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter(isNum);
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

/** CAGR entre primer y último valor positivo de la serie (años = length-1). */
export function cagr(first: number | null | undefined, last: number | null | undefined, years: number): number | null {
  if (!isNum(first) || !isNum(last) || first <= 0 || last <= 0 || years <= 0) return null;
  return (Math.pow(last / first, 1 / years) - 1) * 100;
}

export function safeDiv(a: number | null | undefined, b: number | null | undefined): number | null {
  if (!isNum(a) || !isNum(b) || b === 0) return null;
  return a / b;
}

export const pct = (a: number | null | undefined, b: number | null | undefined): number | null => {
  const r = safeDiv(a, b);
  return r === null ? null : r * 100;
};
