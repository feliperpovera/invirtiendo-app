import { getHealth, env } from "@/lib/providers/http";

export async function GET() {
  return Response.json({
    keys: {
      finnhub: !!env.finnhub(),
      alphavantage: !!env.alphavantage(),
      marketaux: !!env.marketaux(),
      polygon: !!env.polygon(),
      secUserAgent: env.secUA(),
    },
    providers: getHealth(),
    now: Date.now(),
  });
}
