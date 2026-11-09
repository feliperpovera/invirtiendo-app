import { NextRequest, after } from "next/server";
import { evaluate } from "@/lib/evaluate";
import { guardarRanking, rankingPendientes } from "@/lib/providers/ranking";

/**
 * Job diario del ranking (.github/workflows/tareas.yml). Reevalúa cada acción del universo con el
 * precio y el Fair Value del día y deja el resultado en la tabla `ranking`.
 *
 * Cada acción tarda ~10-20 s (Yahoo, SEC y cuatro plataformas), así que un solo turno no
 * alcanza para todo el universo: evalúa lo que cabe en el presupuesto de tiempo y, si queda
 * algo, se vuelve a llamar a sí mismo sin esperar la respuesta. Lo que falló no se reintenta
 * en el mismo día (`omitir`) y hay un tope de saltos por si algo se atasca.
 *
 * Solo responde con `Authorization: Bearer $CRON_SECRET`, que Vercel manda solo en el cron.
 */
export const maxDuration = 300;
const PRESUPUESTO_MS = (maxDuration - 60) * 1000;
const CONCURRENCIA = 3;
const VENCE_HORAS = 20;
const MAX_SALTOS = 12;

export async function GET(req: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("No autorizado", { status: 401 });
  }

  const inicio = Date.now();
  const salto = Number(req.nextUrl.searchParams.get("salto") ?? 0) || 0;
  const omitir = (req.nextUrl.searchParams.get("omitir") ?? "").split(",").filter(Boolean);
  // `horas=0` fuerza el recálculo de TODO el universo aunque esté fresco (se usa cuando
  // cambia el modelo y las calificaciones guardadas quedan obsoletas). El corte resultante
  // viaja como `desde` a los turnos encadenados: lo ya recalculado en esta cadena sale de la
  // cola, así la cadena avanza sobre lo que falta y termina sola.
  const desdeParam = Number(req.nextUrl.searchParams.get("desde"));
  const horasParam = Number(req.nextUrl.searchParams.get("horas"));
  const desde =
    Number.isFinite(desdeParam) && desdeParam > 0
      ? desdeParam
      : inicio - (Number.isFinite(horasParam) && horasParam >= 0 ? horasParam : VENCE_HORAS) * 3600_000;
  // `lote=N`: evalúa como mucho N acciones en esta llamada (Cloudflare gratis: 50 llamadas externas por invocación)
  const lote = Number(req.nextUrl.searchParams.get("lote")) || Infinity;
  // `parte=k/n`: solo las acciones cuyo ticker cae en el carril k de n (hash estable), para correr n carriles en paralelo sin repetir
  const [k, n] = (req.nextUrl.searchParams.get("parte") ?? "0/1").split("/").map(Number);
  const carril = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % (n || 1);
  const todas = (await rankingPendientes((Date.now() - desde) / 3600_000, omitir)).filter((t) => carril(t) === (k || 0));
  const pendientes = todas.length;
  const cola = lote === Infinity ? todas : todas.slice(0, lote);
  const ok: string[] = [];
  const fallidas: string[] = [];

  const obrero = async () => {
    while (cola.length && Date.now() - inicio < PRESUPUESTO_MS) {
      const t = cola.shift()!;
      try {
        await guardarRanking(await evaluate(t));
        ok.push(t);
      } catch {
        fallidas.push(t);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCIA }, obrero));

  const restantes = lote === Infinity ? cola.length : pendientes - ok.length - fallidas.length;
  // Con `lote` encadena quien llama (GitHub Actions): un worker de Cloudflare no puede llamarse a sí mismo por URL
  if (restantes > 0 && salto < MAX_SALTOS && lote === Infinity) {
    const base = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : req.nextUrl.origin;
    const url = new URL("/api/cron/ranking", base);
    url.searchParams.set("salto", String(salto + 1));
    url.searchParams.set("desde", String(desde));
    const omitirSig = [...omitir, ...fallidas];
    if (omitirSig.length) url.searchParams.set("omitir", omitirSig.join(","));
    // Dispara el siguiente turno y suelta: la otra invocación sigue sola aunque esta ya cerró.
    after(() => fetch(url, { headers: { authorization: `Bearer ${secreto}` }, signal: AbortSignal.timeout(8000) }).catch(() => {}));
  }

  return Response.json(
    { salto, pendientes, evaluadas: ok.length, fallidas, restantes, desde, omitir: [...omitir, ...fallidas], segundos: Math.round((Date.now() - inicio) / 1000) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
