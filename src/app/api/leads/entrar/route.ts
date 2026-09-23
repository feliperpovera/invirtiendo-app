import { NextRequest } from "next/server";

/**
 * "Iniciar sesión" con solo el correo: si ya se registró, devuelve nombre, apellido y usuario
 * y el navegador vuelve a quedar desbloqueado. Usa la función `lead_entrar` de Postgres,
 * que solo entrega el registro de ESE correo exacto (la llave publicable no puede listar).
 */
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[a-z]{2,}$/i;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL.test(email)) return Response.json({ error: "Ese correo no parece válido" }, { status: 400 });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return Response.json({ error: "Sin base de datos configurada" }, { status: 503 });
  const r = await fetch(`${url}/rest/v1/rpc/lead_entrar`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_email: email }),
  }).catch(() => null);
  if (!r || !r.ok) return Response.json({ error: "No pudimos consultar el registro. Intenta de nuevo." }, { status: 502 });
  const filas = (await r.json().catch(() => [])) as Array<{ nombre: string; apellido: string; usuario: string }>;
  if (!filas.length) return Response.json({ error: "Ese correo no está registrado. Regístrate abajo." }, { status: 404 });
  return Response.json({ ok: true, ...filas[0], email });
}
