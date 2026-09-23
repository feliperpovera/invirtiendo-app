# Invirtiendo · Evaluador de acciones

Aplicación web para evaluar acciones individuales de EE. UU. con el proceso de **7 filtros estilo Buffett** del canal @Invirtiendoo: negocio, foso, números, dueños, diez años, precio y plan. Usa datos reales y gratuitos, califica noticias (bullish/bearish), compara con competidores y mantiene una watchlist con precios en vivo y zonas de compra.

## Arranque en 3 pasos

```bash
cd invirtiendo-app
cp .env.example .env.local      # pega tus llaves gratuitas (ver abajo)
npm install && npm run dev      # http://localhost:3000
```

Funciona **sin llaves** (Yahoo Finance + SEC EDGAR). Con dos llaves gratuitas se desbloquea todo:

| Llave | Dónde | Gratis | Qué aporta |
|---|---|---|---|
| `FINNHUB_API_KEY` | https://finnhub.io/register | 60 llamadas/min | Cotización en tiempo real, 100+ ratios con 10 años de historia, competidores del sub-sector, analistas, insiders, sorpresas y calendario de earnings, noticias |
| `ALPHAVANTAGE_API_KEY` | https://www.alphavantage.co/support/#api-key | 25 llamadas/día | Noticias con score de sentimiento por ticker (se cachea 12 h por símbolo) |
| `MARKETAUX_API_KEY` (opcional) | https://www.marketaux.com/register | 100/día | Respaldo de noticias con sentimiento |

La SEC exige un `User-Agent` con nombre y email (ya configurado en `.env.example`).

## Qué calcula

- **Checklist Buffett (7 filtros)**: 2, 3, 4 y 6 automáticos con umbrales del proceso (margen bruto ≥ 40% estable, ROIC > 15%, ROE > 15%, margen neto > 10%, utilidades sin caos, deuda < 4 años de utilidades, FCF ≈ utilidad; recompras, SBC, retorno de capital, insiders, cumplimiento de guía). Filtros 1 y 5 son cualitativos: el usuario responde y el veredicto se recalcula.
- **Valor intrínseco consenso**: DCF a 10 años (50%) con supuestos editables en vivo, múltiplo histórico P/E (25%), P/E justo con PEG = 1 (25%), Graham como referencia. DCF inverso (crecimiento implícito). Normaliza FCF en ciclos de inversión (capex IA), ajusta por compensación en acciones y re-expresa splits.
- **Margen de seguridad y señal**: > 20% oportunidad atractiva · 10-20% compra gradual · ±10% observar · negativo esperar · muy negativo evitar. Un fallo en filtros 1-5 descarta.
- **Riesgo**: beta, volatilidad, caída máxima 5 años, deuda, cobertura, liquidez, tamaño, cíclica, interés en corto, riesgo de evento (earnings ≤ 10 días).
- **Competidores**: tabla de forward P/E, PEG, P/S, márgenes, ROE y crecimiento vs mediana de pares y vs índice.
- **Noticias**: sentimiento por titular (Alpha Vantage o léxico financiero propio), agregado ponderado por recencia, temas, titulares que más pesan a favor y en contra, consenso de analistas, insiders.
- **Invirtiendo Score (0-100)** y **plan**: perfil núcleo/satélite, tamaño máximo (regla 60/30/10), 2-3 tramos con precios límite, plantilla de tesis en 3 líneas.
- **Watchlist** (localStorage): VI y zona de compra guardados, precios cada 60 s, tramos con costo promedio, rentabilidad, EM y EA. Exportable a JSON.
- **Pulso del mercado**: índices, VIX, bono a 10 años y un índice miedo/codicia propio con la guía de uso del canal.

## Estructura

```
src/lib/providers/   yahoo · sec · finnhub · alphavantage · marketaux · cache (memoria + disco) · http (salud)
src/lib/analysis/    fundamentals · valuation · pillars · risk · sentiment · peers · buffett · score · market
src/lib/evaluate.ts  orquestador con degradación elegante entre fuentes
src/app/api/         search · quote · market · stock/[ticker] · health
src/app/             / · accion/[ticker] · watchlist · comparar · metodo · fuentes
src/components/      UI de marca (Fraunces + Figtree · crema / tinta / terracota / oliva)
```

## Prueba automatizada

```bash
npx playwright install chromium   # una sola vez
node scripts/smoke.mjs http://localhost:3000 NVDA
```

Verifica con Chromium headless: carga e hidratación, checklist interactivo, DCF editable, watchlist con precio en vivo y ausencia de errores de consola.

## Despliegue

Es una app Next.js estándar: `vercel` (gratis) con las mismas variables de entorno. La caché en disco solo aplica en local; en serverless usa la caché en memoria por instancia. Con las cachés configuradas (evaluación 5 min, métricas 6 h, sentimiento 12 h), decenas de usuarios diarios caben en los planes gratuitos.

## Aviso

Información educativa. No es recomendación ni asesoría financiera. Los valores intrínsecos son estimaciones con supuestos declarados; los precios pueden tener hasta 15 minutos de retraso.
