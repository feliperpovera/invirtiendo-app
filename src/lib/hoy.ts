export type Op = { fecha: string; ticker: string; tipo: string; cantidad: number | null; precio: number | null };

/** Fecha (AAAA-MM-DD) de la sesión de Nueva York a la que pertenece una cotización. */
export const diaNY = (ms: number) => new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/New_York" });

/**
 * Ganancia de la sesión de una posición: lo que ya se tenía se mide contra el cierre anterior; lo comprado
 * hoy, contra lo pagado; lo vendido hoy, del cierre anterior al precio de venta. Sin comisiones.
 */
export function ganaHoy(cant: number, precio: number, ant: number, ops: Op[]) {
  let comprado = 0, pagado = 0, vendido = 0, cobrado = 0;
  for (const o of ops) {
    const q = Number(o.cantidad ?? 0), m = q * Number(o.precio ?? 0);
    if (o.tipo === "venta") { vendido += q; cobrado += m; } else { comprado += q; pagado += m; }
  }
  const alAbrir = cant - comprado + vendido;
  return { gana: cant * precio - pagado + cobrado - alAbrir * ant, base: alAbrir * ant + pagado };
}
