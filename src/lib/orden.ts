export type Valor = number | string | null | undefined;

/** Copia ordenada; los vacíos quedan siempre al final, suba o baje. */
export function ordenar<T>(filas: T[], valor: (f: T) => Valor, desc: boolean): T[] {
  const vacio = (v: Valor) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));
  return [...filas].sort((a, b) => {
    const x = valor(a), y = valor(b);
    if (vacio(x) || vacio(y)) return Number(vacio(x)) - Number(vacio(y));
    const c = typeof x === "string" || typeof y === "string" ? String(x).localeCompare(String(y), "es") : (x as number) - (y as number);
    return desc ? -c : c;
  });
}
