/**
 * Caché de dos niveles (memoria + disco opcional) con TTL.
 * - Memoria: por proceso (funciona en Vercel/serverless).
 * - Disco `.cache/`: solo si el FS es escribible (desarrollo local). Evita
 *   agotar las 25 llamadas/día de Alpha Vantage al reiniciar `next dev`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

type Entry<T> = { v: T; exp: number };

const mem = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();
const DISK_DIR = path.join(process.cwd(), ".cache");
let diskOk: boolean | null = null;

async function diskAvailable(): Promise<boolean> {
  if (diskOk !== null) return diskOk;
  try {
    await fs.mkdir(DISK_DIR, { recursive: true });
    await fs.access(DISK_DIR);
    diskOk = true;
  } catch {
    diskOk = false;
  }
  return diskOk;
}

const fileFor = (key: string) =>
  path.join(DISK_DIR, crypto.createHash("sha1").update(key).digest("hex") + ".json");

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  const m = mem.get(key) as Entry<T> | undefined;
  if (m && m.exp > Date.now()) return m.v;
  if (m) mem.delete(key);
  if (await diskAvailable()) {
    try {
      const raw = await fs.readFile(fileFor(key), "utf8");
      const e = JSON.parse(raw) as Entry<T>;
      if (e.exp > Date.now()) {
        mem.set(key, e);
        return e.v;
      }
    } catch {
      /* miss */
    }
  }
  return undefined;
}

export async function cacheSet<T>(key: string, v: T, ttlMs: number): Promise<void> {
  const e: Entry<T> = { v, exp: Date.now() + ttlMs };
  mem.set(key, e);
  if (await diskAvailable()) {
    fs.writeFile(fileFor(key), JSON.stringify(e)).catch(() => {});
  }
}

/**
 * Memoiza una función asíncrona por clave con TTL y deduplicación de
 * llamadas concurrentes (dos pestañas pidiendo NVDA = una sola llamada).
 * Si `fn` falla y hay un valor vencido en caché, lo devuelve (stale-if-error).
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = await cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const p = (async () => {
    try {
      const v = await fn();
      if (v !== undefined && v !== null) await cacheSet(key, v, ttlMs);
      return v;
    } catch (err) {
      const stale = mem.get(key) as Entry<T> | undefined;
      if (stale) return stale.v;
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export const TTL = {
  quote: 60 * 1000,
  search: 6 * 3600 * 1000,
  profile: 24 * 3600 * 1000,
  metrics: 6 * 3600 * 1000,
  history: 6 * 3600 * 1000,
  sec: 24 * 3600 * 1000,
  news: 30 * 60 * 1000,
  sentimentAV: 12 * 3600 * 1000,
  peers: 24 * 3600 * 1000,
  market: 2 * 60 * 1000,
  calendar: 12 * 3600 * 1000,
} as const;
