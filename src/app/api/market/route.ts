import { yahooIndex } from "@/lib/providers/yahoo";
import { computeMood, vixLabel, marketMultiples, ytdPct } from "@/lib/analysis/market";
import type { MarketPulse } from "@/lib/analysis/types";
import { cached, TTL } from "@/lib/providers/cache";
import { cnnFearGreed } from "@/lib/providers/cnn";
import { xoomarYieldCurve } from "@/lib/providers/xoomar";

const IDX = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^NDX", name: "Nasdaq-100" },
  { symbol: "^DJI", name: "Dow Jones" },
  { symbol: "^RUT", name: "Russell 2000" },
];

export async function GET() {
  try {
    const pulse = await cached<MarketPulse>("market:pulse", TTL.market, async () => {
      const [idx, vix, tnx, curve] = await Promise.all([
        Promise.all(IDX.map(async (i) => ({ ...i, ...(await yahooIndex(i.symbol)) }))),
        yahooIndex("^VIX"),
        yahooIndex("^TNX").catch(() => null),
        // Curva del Tesoro (XOOMAR): contexto macro; si falla, el pulso sale igual
        xoomarYieldCurve().catch(() => null),
      ]);
      const spx = idx[0];
      let mood = computeMood({ symbol: spx.symbol, name: spx.name, price: spx.price, changePct: spx.changePct, high52: spx.high52, closes1y: spx.closes1y }, vix.price);
      // Índice oficial de CNN (7 indicadores). Si no responde, queda el cálculo propio.
      const cnn = await cnnFearGreed().catch(() => null);
      if (cnn) {
        const score = Math.round(cnn.score);
        const ES: Record<string, string> = { "extreme fear": "Miedo extremo", fear: "Miedo", neutral: "Neutral", greed: "Codicia", "extreme greed": "Codicia extrema" };
        const label = ES[cnn.rating] ?? cnn.rating;
        const advice = score <= 25 ? "Revisa tu watchlist. Valida tesis y valoración. Si compras, hazlo por tramos." : score <= 45 ? "Repasa la watchlist: compra solo lo que llegue a su Buy Zone." : score <= 55 ? "Sigue tu plan y tus aportes. No fuerces una decisión." : score <= 75 ? "Disciplina: no perseguir nada que subió >20% en un mes." : "Baja el ritmo. Revisa precio y Margin of Safety antes de cada tramo.";
        const f = (v: number | null) => (v === null ? "—" : String(Math.round(v)));
        mood = {
          score,
          label,
          advice,
          components: [
            { key: "prev", label: "Cierre anterior", value: f(cnn.previousClose), score: Math.round(cnn.previousClose ?? score) },
            { key: "week", label: "Hace 1 semana", value: f(cnn.previousWeek), score: Math.round(cnn.previousWeek ?? score) },
            { key: "month", label: "Hace 1 mes", value: f(cnn.previousMonth), score: Math.round(cnn.previousMonth ?? score) },
            { key: "year", label: "Hace 1 año", value: f(cnn.previousYear), score: Math.round(cnn.previousYear ?? score) },
          ],
        };
      }
      return {
        asOf: Date.now(),
        indices: idx.map((i) => ({
          symbol: i.symbol,
          name: i.name,
          price: i.price,
          changePct: i.changePct,
          ytdPct: ytdPct(i.closes1y, i.price),
          fromHigh52: i.high52 ? (i.price / i.high52 - 1) * 100 : null,
        })),
        vix: { value: vix.price, label: vixLabel(vix.price) },
        tenYear: tnx ? tnx.price : null,
        curve,
        mood,
        marketForwardPe: marketMultiples(),
      };
    });
    return Response.json(pulse, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "error" }, { status: 502 });
  }
}
