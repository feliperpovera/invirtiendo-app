import { NextRequest } from "next/server";

/**
 * Guarda un registro (nombre, apellido, correo) en Supabase vía REST, sin SDK.
 * La llave es la publicable: la tabla `leads` solo permite INSERT a anon (sin SELECT),
 * así que aunque se filtre nadie puede leer la lista. El país sale del borde de Vercel.
 */
export const runtime = "nodejs";

const ORIGENES = new Set(["watchlist", "simulador", "accion", "comparar", "comparar-etf"]);
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}$/i;
const limpio = (s: unknown, max: number) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, max) : "");

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const nombre = limpio(body.nombre, 60);
  const apellido = limpio(body.apellido, 60);
  const email = limpio(body.email, 254).toLowerCase();
  const origen = limpio(body.origen, 20);
  const detalle = limpio(body.detalle, 120);
  if (nombre.length < 2 || apellido.length < 2) return Response.json({ error: "Escribe tu nombre y apellido" }, { status: 400 });
  if (!EMAIL.test(email)) return Response.json({ error: "Ese correo no parece válido" }, { status: 400 });
  if (body.acepta !== true) return Response.json({ error: "Necesitamos tu autorización para guardar los datos" }, { status: 400 });

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) {
    // Sin base de datos configurada no se bloquea al visitante: se registra en el log y sigue.
    console.warn("[leads] SUPABASE_URL/SUPABASE_KEY sin configurar; registro no guardado", { email, origen });
    return Response.json({ ok: true, guardado: false });
  }

  const pais = req.headers.get("x-vercel-ip-country") ?? null;
  const usuario = email.split("@")[0];
  const fila = { nombre, apellido, email, usuario, pais, origen: ORIGENES.has(origen) ? origen : null, detalle: detalle || null, acepta_politica: true };
  const r = await fetch(`${url}/rest/v1/leads`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(fila),
  }).catch(() => null);

  // 409 = ese correo ya estaba: cuenta como registrado, no como error.
  if (r && (r.ok || r.status === 409)) return Response.json({ ok: true, guardado: r.ok, repetido: r.status === 409, usuario });
  console.error("[leads] Supabase respondió", r?.status, await r?.text().catch(() => ""));
  return Response.json({ error: "No pudimos guardar el registro. Intenta de nuevo." }, { status: 502 });
}
