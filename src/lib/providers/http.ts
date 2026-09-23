import type { ProviderName } from "@/lib/analysis/types";

export class ProviderError extends Error {
  provider: ProviderName;
  status: number;
  premium: boolean;
  rateLimited: boolean;
  constructor(provider: ProviderName, status: number, message: string) {
    super(`[${provider}] ${status}: ${message}`);
    this.provider = provider;
    this.status = status;
    this.premium = status === 403 || /premium|access to this resource/i.test(message);
    this.rateLimited = status === 429 || /rate limit|limit reached|premium plans.*requests/i.test(message);
  }
}

type Health = { ok: boolean; lastOk: number | null; lastError: string | null; lastErrorAt: number | null; calls: number };
const health = new Map<ProviderName, Health>();

export function recordHealth(p: ProviderName, ok: boolean, err?: string) {
  const h = health.get(p) ?? { ok: true, lastOk: null, lastError: null, lastErrorAt: null, calls: 0 };
  h.calls += 1;
  if (ok) {
    h.ok = true;
    h.lastOk = Date.now();
  } else {
    h.ok = false;
    h.lastError = err ?? "error";
    h.lastErrorAt = Date.now();
  }
  health.set(p, h);
}

export function getHealth(): Record<string, Health> {
  return Object.fromEntries(health.entries());
}

export async function fetchJson<T>(
  provider: ProviderName,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 12000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    if (!res.ok) {
      recordHealth(provider, false, `${res.status} ${text.slice(0, 120)}`);
      throw new ProviderError(provider, res.status, text.slice(0, 200) || res.statusText);
    }
    let json: T;
    try {
      json = JSON.parse(text) as T;
    } catch {
      recordHealth(provider, false, "respuesta no-JSON");
      throw new ProviderError(provider, 502, "respuesta no-JSON: " + text.slice(0, 80));
    }
    recordHealth(provider, true);
    return json;
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    recordHealth(provider, false, msg);
    throw new ProviderError(provider, 0, msg);
  } finally {
    clearTimeout(timer);
  }
}

/** Ejecuta promesas con concurrencia limitada (para no disparar 429). */
export async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

export const env = {
  finnhub: () => process.env.FINNHUB_API_KEY?.trim() || null,
  alphavantage: () => process.env.ALPHAVANTAGE_API_KEY?.trim() || null,
  marketaux: () => process.env.MARKETAUX_API_KEY?.trim() || null,
  polygon: () => process.env.POLYGON_API_KEY?.trim() || null,
  secUA: () => process.env.SEC_USER_AGENT?.trim() || "Invirtiendo Evaluador info@revupagencygroup.com",
};
