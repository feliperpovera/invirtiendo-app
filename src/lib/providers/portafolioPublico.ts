/** Portafolio público de Invirtiendoo con los números de IBKR (cantidades, precios y montos: el usuario eligió publicarlos). Lo carga la tarea `sync-portafolio-ibkr`. */
export interface PosicionPublica { ticker: string; peso: number; rent: number | null; desde: string | null; actualizado: string; cantidad: number | null; precio_prom: number | null; precio: number | null; valor: number | null; pnl: number | null; pnl_dia: number | null }
export interface MovimientoPublico { ref: string; fecha: string; ticker: string; tipo: "nueva" | "compra" | "venta"; pct_posicion: number | null; rent_pct: number | null; cantidad: number | null; precio: number | null; monto: number | null; pnl_realizado: number | null }
export interface ResumenPublico { nav: number | null; efectivo: number | null; actualizado: string }

async function leer<T>(q: string): Promise<T[]> {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_KEY;
  if (!url || !key) return [];
  const r = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  return r.ok ? ((await r.json()) as T[]) : [];
}
export const leerPosiciones = (cuenta = "principal") => leer<PosicionPublica>(`portafolio_posiciones?select=*&cuenta=eq.${cuenta}&order=valor.desc`);
export const leerMovimientos = (cuenta = "principal") => leer<MovimientoPublico>(`portafolio_movimientos?select=ref,fecha,ticker,tipo,pct_posicion,rent_pct,cantidad,precio,monto,pnl_realizado&cuenta=eq.${cuenta}&order=fecha.desc,id.desc`);
export const leerResumen = async () => (await leer<ResumenPublico>("portafolio_resumen?select=nav,efectivo,actualizado"))[0] ?? null;
