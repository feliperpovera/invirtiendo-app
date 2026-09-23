/**
 * Cupo diario propio para APIs gratuitas con límite. El contador vive en Supabase
 * (`api_reservar`), así que es uno solo para todos los servidores de Vercel.
 * Los topes quedan por debajo del límite del proveedor: nunca se llega a él y no
 * llegan los correos de "daily limit reached".
 */
export const CUPO = {
  marketaux: 80, // de 100 al día
  alphavantage: 20, // de 25 al día
} as const;

/** true = hay cupo y la llamada ya quedó contada. Si el contador falla, NO se llama (mejor sin noticias que con correo). */
export async function reservarCupo(api: keyof typeof CUPO): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;
  if (!url || !key) return false;
  try {
    const r = await fetch(`${url}/rest/v1/rpc/api_reservar`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_api: api, p_limite: CUPO[api] }),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    return r.ok && (await r.json()) === true;
  } catch {
    return false;
  }
}
