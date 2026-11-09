// Worker de Cloudflare: la web de OpenNext con caché en el borde para las lecturas de /api/.
// El plan gratis da 10 ms de CPU por petición; las respuestas grandes (series de un año) a veces lo pasan.
// Guardando cada respuesta unos segundos, casi todas las visitas la reciben sin recalcular.
// @ts-ignore: lo genera `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

type Ctx = { waitUntil(p: Promise<unknown>): void };
const SIN_CACHE = /^\/api\/(leads|cron)/;

export default {
  async fetch(req: Request, env: unknown, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== "GET" || !url.pathname.startsWith("/api/") || SIN_CACHE.test(url.pathname)) return handler.fetch(req, env, ctx);
    const cache = (caches as unknown as { default: Cache }).default;
    const hit = await cache.match(req);
    if (hit) return hit;
    const res: Response = await handler.fetch(req, env, ctx);
    if (res.status !== 200) return res;
    // Cotizaciones en vivo: 10 s; evaluación de una acción: 10 min; lo demás respeta su s-maxage o usa 60 s
    const sMax = Number(/s-maxage=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1]);
    const ttl = url.pathname.startsWith("/api/quote") ? 10 : url.pathname.startsWith("/api/stock") ? 600 : sMax || 60;
    const copia = new Response(res.body, res);
    copia.headers.set("cache-control", `public, max-age=0, s-maxage=${ttl}`);
    ctx.waitUntil(cache.put(req, copia.clone()));
    return copia;
  },
};
