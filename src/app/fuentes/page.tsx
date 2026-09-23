import type { Metadata } from "next";
import { Card, Eyebrow } from "@/components/ui";
import { env, getHealth } from "@/lib/providers/http";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Fuentes de datos" };
export const dynamic = "force-dynamic";

const SOURCES = [
  {
    key: "yahoo",
    name: "Yahoo Finance (público)",
    free: "Sin llave · sin registro",
    gives: "Cotizaciones (retraso ≤15 min), histórico de precios 10 años, fundamentales 4 años, forward P/E, PEG, EV/EBITDA, búsqueda de símbolos, noticias de respaldo.",
    limit: "Endpoints no oficiales: pueden cambiar sin aviso. La app degrada a Finnhub/SEC si fallan.",
    url: "https://finance.yahoo.com",
    needsKey: false,
  },
  {
    key: "sec",
    name: "SEC EDGAR · XBRL Company Facts",
    free: "Sin llave · exige User-Agent con nombre y email",
    gives: "10-16 años de estados financieros auditados (10-K): ingresos, utilidad, FCF, deuda, caja, acciones, recompras, dividendos, SBC, I+D.",
    limit: "Solo empresas que reportan en US-GAAP (las extranjeras con IFRS, como ASML o TSM, usan Yahoo).",
    url: "https://www.sec.gov/search-filings/edgar-application-programming-interfaces",
    needsKey: false,
  },
  {
    key: "finnhub",
    name: "Finnhub",
    free: "Gratis · 60 llamadas/min · sin tarjeta",
    gives: "Cotización en tiempo real, perfil, 100+ ratios (P/E, ROE, márgenes, beta, deuda), ratios históricos 10 años, competidores, recomendaciones de analistas, insiders, sorpresas y calendario de earnings, noticias.",
    limit: "Velas históricas, price target y news-sentiment son de pago (no se usan). Uso personal, no comercial.",
    url: "https://finnhub.io/register",
    needsKey: true,
    envName: "FINNHUB_API_KEY",
  },
  {
    key: "polygon",
    name: "Polygon.io (Massive)",
    free: "Gratis · 5 llamadas/min · SIN tope diario",
    gives: "Noticias con sentimiento por ticker (positivo / neutral / negativo) y el razonamiento en texto. Es la fuente principal de noticias: ~7.000 llamadas al día contra las 100 de Marketaux.",
    limit: "5 por minuto (la app las encola sola). Datos de precios con 15 min de retraso, no los usamos.",
    url: "https://polygon.io/dashboard/signup",
    needsKey: true,
    envName: "POLYGON_API_KEY",
  },
  {
    key: "alphavantage",
    name: "Alpha Vantage · NEWS_SENTIMENT",
    free: "Gratis · 25 llamadas/día",
    gives: "Noticias con score de sentimiento por ticker (Bullish → Bearish), relevancia y temas.",
    limit: "25 al día: la app cachea 12 h por símbolo. Sin llave usa el léxico propio.",
    url: "https://www.alphavantage.co/support/#api-key",
    needsKey: true,
    envName: "ALPHAVANTAGE_API_KEY",
  },
  {
    key: "marketaux",
    name: "Marketaux (opcional)",
    free: "Gratis · 100 llamadas/día",
    gives: "Tercer respaldo de noticias con sentimiento por entidad.",
    limit: "Se agota rápido: 100 al día. Solo entra si Polygon y Alpha Vantage fallan.",
    url: "https://www.marketaux.com/register",
    needsKey: true,
    envName: "MARKETAUX_API_KEY",
  },
];

export default function FuentesPage() {
  const keys = { finnhub: !!env.finnhub(), alphavantage: !!env.alphavantage(), marketaux: !!env.marketaux(), polygon: !!env.polygon() };
  const health = getHealth();
  return (
    <div className="pt-10 space-y-6">
      <div>
        <Eyebrow>Fuentes de datos · estado</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">Datos reales, gratis, con degradación elegante.</h1>
        <p className="text-ink-soft mt-3 max-w-2xl">La app funciona sin llaves (Yahoo + SEC). Con dos llaves gratuitas (Finnhub y Alpha Vantage) se desbloquea todo: analistas, insiders, competidores del sector y sentimiento calificado.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SOURCES.map((s) => {
          const configured = !s.needsKey || keys[s.key as keyof typeof keys];
          const h = health[s.key];
          return (
            <Card key={s.key}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl">{s.name}</h2>
                  <p className="text-xs text-ink-soft">{s.free}</p>
                </div>
                <span className="pill" style={{ background: configured ? "var(--sig-strong)" : "var(--sig-watch)", color: configured ? "var(--cream)" : "var(--ink)" }}>
                  {s.needsKey ? (configured ? "Llave configurada" : "Sin llave") : "Activo"}
                </span>
              </div>
              <p className="text-sm mt-3">
                <b>Da:</b> {s.gives}
              </p>
              <p className="text-sm text-ink-soft mt-1">
                <b>Límite:</b> {s.limit}
              </p>
              {h && (
                <p className="text-xs mt-2" style={{ color: h.ok ? "var(--sig-strong)" : "var(--sig-avoid)" }}>
                  {h.ok ? `● OK · ${h.calls} llamadas esta sesión · última ${h.lastOk ? timeAgo(h.lastOk) : "—"}` : `● Último error: ${h.lastError ?? "—"} (${h.lastErrorAt ? timeAgo(h.lastErrorAt) : ""})`}
                </p>
              )}
              {s.needsKey && !configured && (
                <div className="mt-3 rounded-xl bg-cream-2 p-3 text-sm">
                  <p className="font-semibold">Cómo activarla (2 minutos):</p>
                  <ol className="list-decimal list-inside text-ink-soft mt-1 space-y-0.5">
                    <li>
                      Regístrate gratis en{" "}
                      <a className="text-terracotta font-semibold hover:underline" href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.url.replace("https://", "")}
                      </a>{" "}
                      y copia la llave.
                    </li>
                    <li>
                      Pégala en <code className="bg-paper px-1 rounded">.env.local</code> como <code className="bg-paper px-1 rounded">{s.envName}=tu_llave</code>.
                    </li>
                    <li>Reinicia el servidor (npm run dev) o redepliega.</li>
                  </ol>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Card ink>
        <Eyebrow>Caché y cuotas</Eyebrow>
        <ul className="text-sm mt-2 space-y-1 muted">
          <li>Cotizaciones: 60 s · Evaluación completa: 5 min · Métricas: 6 h · Noticias: 30 min · Sentimiento Alpha Vantage: 12 h · SEC, perfiles y ETFs: 24 h.</li>
          <li>Las llamadas concurrentes al mismo símbolo se deduplican; si un proveedor falla, se sirve el último valor conocido.</li>
          <li>Con estas cachés, un uso normal cabe en los planes gratuitos aun con decenas de personas evaluando acciones al día.</li>
        </ul>
      </Card>
    </div>
  );
}
