import { cached } from "./cache";
import type { PlatformEstimate } from "@/lib/analysis/forward";

/**
 * Estimaciones de Fair Value / precio objetivo de plataformas públicas, leídas de sus
 * páginas. Sin llaves, sin SDK. Cada una se cachea 24 h y falla en silencio: si una
 * plataforma cambia su página o bloquea, la acción se valora con las demás.
 * Morningstar, Investing.com, Simply Wall St y Alpha Spread NO se leen: su Fair Value
 * está detrás de login o de Cloudflare (verificado 8 sep 2026).
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DIA = 24 * 3600 * 1000;

async function html(url: string): Promise<string> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Accept: "text/html" }, signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(t);
  }
}
const texto = (s: string) =>
  s
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ");
const num = (s: string | undefined) => {
  const v = Number((s ?? "").replace(/[,$]/g, ""));
  return Number.isFinite(v) && v > 0 ? v : null;
};

export interface Forecast {
  revenueThisYear: number | null;
  revenueNextYear: number | null;
  epsThisYear: number | null;
  epsNextYear: number | null;
  revGrowthThisYear: number | null;
  revGrowthNextYear: number | null;
  epsGrowthThisYear: number | null;
  epsGrowthNextYear: number | null;
}

/** GuruFocus · GF Value (modelo propio a partir de múltiplos históricos, crecimiento y rentabilidad). */
async function gurufocus(symbol: string): Promise<PlatformEstimate | null> {
  const url = `https://www.gurufocus.com/stock/${symbol}/summary`;
  const t = texto(await html(url));
  const v = num(t.match(/GF Value[™]?:?\s*\$?([\d.,]+)/)?.[1]);
  return v ? { fuente: "GuruFocus · GF Value", tipo: "modelo", valor: v, url } : null;
}

/** ValueInvesting.io · valor intrínseco por DCF (muy conservador; cuenta como una voz más). */
async function valueinvesting(symbol: string): Promise<PlatformEstimate | null> {
  const url = `https://valueinvesting.io/${symbol}/valuation/intrinsic-value`;
  const t = texto(await html(url));
  const v = num(t.match(/Intrinsic Value of [^()]+\([A-Z.\-]+\) is\s*\$?([\d.,]+)/)?.[1]);
  return v ? { fuente: "ValueInvesting.io · DCF", tipo: "modelo", valor: v, url } : null;
}

/** StockAnalysis · precio objetivo promedio y pronósticos de ingresos/EPS de este año y el próximo. */
async function stockanalysis(symbol: string): Promise<{ estimate: PlatformEstimate | null; forecast: Forecast | null }> {
  const url = `https://stockanalysis.com/stocks/${symbol.toLowerCase()}/forecast/`;
  const t = texto(await html(url));
  const target = num(t.match(/price target of \$([\d.,]+)/)?.[1]);
  const pct = (re: RegExp) => {
    const m = t.match(re);
    if (!m) return null;
    const v = Number(m[1]);
    return Number.isFinite(v) ? (/Decreased|decrease/i.test(m[0]) ? -v : v) : null;
  };
  const big = (s: string | undefined) => {
    if (!s) return null;
    const m = s.match(/([\d.]+)\s*([BMT])/);
    if (!m) return null;
    return Number(m[1]) * ({ B: 1e9, M: 1e6, T: 1e12 } as Record<string, number>)[m[2]];
  };
  const forecast: Forecast = {
    revenueThisYear: big(t.match(/Revenue This Year\s*([\d.]+[BMT])/)?.[1]),
    revenueNextYear: big(t.match(/Revenue Next Year\s*([\d.]+[BMT])/)?.[1]),
    epsThisYear: num(t.match(/EPS This Year\s*([\d.]+)/)?.[1]),
    epsNextYear: num(t.match(/EPS Next Year\s*([\d.]+)/)?.[1]),
    revGrowthThisYear: pct(/Revenue This Year[^%]*?(?:Increased|Decreased) by ([\d.]+)%/),
    revGrowthNextYear: pct(/Revenue Next Year[^%]*?(?:Increased|Decreased) by ([\d.]+)%/),
    epsGrowthThisYear: pct(/EPS This Year[^%]*?(?:Increased|Decreased) by ([\d.]+)%/),
    epsGrowthNextYear: pct(/EPS Next Year[^%]*?(?:Increased|Decreased) by ([\d.]+)%/),
  };
  const hay = Object.values(forecast).some((v) => v !== null);
  return { estimate: target ? { fuente: "StockAnalysis · objetivo analistas", tipo: "objetivo", valor: target, url } : null, forecast: hay ? forecast : null };
}

/** TradingView · precio objetivo promedio de analistas. */
async function tradingview(symbol: string, exchange: string): Promise<PlatformEstimate | null> {
  const url = `https://www.tradingview.com/symbols/${exchange}-${symbol}/forecast/`;
  const s = await html(url);
  const v = num(s.match(/"price_target_average"\s*:\s*([\d.]+)/)?.[1]) ?? num(texto(s).match(/Price target\s*\$?([\d.,]+)/)?.[1]);
  return v ? { fuente: "TradingView · objetivo analistas", tipo: "objetivo", valor: v, url } : null;
}

export interface PlatformsResult {
  estimates: PlatformEstimate[];
  forecast: Forecast | null;
  fallidas: string[];
}

/** Todas las plataformas en paralelo. `exchange` para TradingView: NASDAQ o NYSE. */
export function platformEstimates(symbol: string, exchange: string | undefined): Promise<PlatformsResult> {
  const ex = /nyse/i.test(exchange ?? "") ? "NYSE" : "NASDAQ";
  return cached(`plat:v1:${symbol}`, DIA, async () => {
    const fallidas: string[] = [];
    const guard = <T,>(nombre: string, p: Promise<T>): Promise<T | null> =>
      p.catch(() => {
        fallidas.push(nombre);
        return null;
      });
    const [gf, vi, sa, tv, tv2] = await Promise.all([
      guard("GuruFocus", gurufocus(symbol)),
      guard("ValueInvesting.io", valueinvesting(symbol)),
      guard("StockAnalysis", stockanalysis(symbol)),
      guard("TradingView", tradingview(symbol, ex)),
      // Si la bolsa era la otra, un segundo intento barato
      guard("TradingView", tradingview(symbol, ex === "NYSE" ? "NASDAQ" : "NYSE")),
    ]);
    const estimates = [gf, vi, sa?.estimate ?? null, tv ?? tv2].filter((x): x is PlatformEstimate => !!x);
    // TradingView solo cuenta como fallida si fallaron las dos bolsas
    const sinTv = !tv && !tv2;
    const fallidasReales = [...new Set(fallidas)].filter((n) => n !== "TradingView" || sinTv);
    return { estimates, forecast: sa?.forecast ?? null, fallidas: fallidasReales };
  });
}
