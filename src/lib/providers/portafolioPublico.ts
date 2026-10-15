/** Portafolio público de Invirtiendoo: solo porcentajes (peso, rentabilidad, % de la posición). Lo carga la tarea `sync-portafolio-ibkr`. */
export interface PosicionPublica { ticker: string; peso: number; rent: number | null; desde: string | null; actualizado: string }
export interface MovimientoPublico { fecha: string; ticker: string; tipo: "nueva" | "compra" | "venta"; pct_posicion: number | null; rent_pct: number | null }

async function leer<T>(q: string): Promise<T[]> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_KEY;
  if (!url || !key) return [];
  const r = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  return r.ok ? ((await r.json()) as T[]) : [];
}
export const leerPosiciones = () => leer<PosicionPublica>("portafolio_posiciones?select=*&order=peso.desc");
export const leerMovimientos = () => leer<MovimientoPublico>("portafolio_movimientos?select=fecha,ticker,tipo,pct_posicion,rent_pct&order=fecha.desc,id.desc");
