import { cached } from "@/lib/providers/cache";

/** Fear & Greed oficial de CNN (S&P 500): valor, lecturas pasadas, historia de ~3 años y sus 7 componentes. */
const NOMBRES: Record<string, string> = {
  market_momentum_sp500: "Impulso del mercado (S&P 500 vs media 125 días)",
  stock_price_strength: "Fuerza de precios (máximos vs mínimos de 52 semanas)",
  stock_price_breadth: "Amplitud del mercado (volumen que sube vs baja)",
  put_call_options: "Opciones put/call",
  market_volatility_vix: "Volatilidad (VIX)",
  safe_haven_demand: "Demanda de refugio (acciones vs bonos)",
  junk_bond_demand: "Demanda de bonos basura",
};
type Comp = { score: number; rating: string };
type Resp = Record<string, Comp & { data?: Array<{ x: number; y: number }> }> & {
  fear_and_greed: Comp & { previous_close: number; previous_1_week: number; previous_1_month: number; previous_1_year: number };
};

export async function GET() {
  try {
    const d = await cached("cnn:fg3", 30 * 60_000, async () => {
      const desde = new Date(Date.now() - 3 * 365 * 864e5).toISOString().slice(0, 10);
      const r = await fetch(`https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${desde}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36", Accept: "application/json", Referer: "https://www.cnn.com/markets/fear-and-greed" },
      });
      if (!r.ok) throw new Error(`CNN ${r.status}`);
      const j = (await r.json()) as Resp;
      const f = j.fear_and_greed;
      return {
        score: f.score,
        rating: f.rating,
        previos: { cierre: f.previous_close, semana: f.previous_1_week, mes: f.previous_1_month, anio: f.previous_1_year },
        serie: (j.fear_and_greed_historical?.data ?? []).map((p) => ({ t: p.x, nivel: p.y })),
        componentes: Object.entries(NOMBRES).filter(([k]) => j[k]).map(([k, nombre]) => ({ clave: k, nombre, score: j[k].score, rating: j[k].rating })),
      };
    });
    return Response.json(d, { headers: { "Cache-Control": "s-maxage=600" } });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "CNN no respondió" }, { status: 502 });
  }
}
