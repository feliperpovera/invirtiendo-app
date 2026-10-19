/** Treemap "squarified" (Bruls et al.): rectángulos lo más cuadrados posible, área proporcional al valor. */
export interface Rect { x: number; y: number; w: number; h: number }

export function squarify<T>(items: Array<{ v: number; d: T }>, r: Rect): Array<Rect & { d: T }> {
  const out: Array<Rect & { d: T }> = [];
  const total = items.reduce((a, i) => a + i.v, 0);
  if (!total || r.w <= 0 || r.h <= 0) return out;
  const escala = (r.w * r.h) / total;
  let resto = [...items].filter((i) => i.v > 0).sort((a, b) => b.v - a.v).map((i) => ({ ...i, a: i.v * escala }));
  let { x, y, w, h } = r;
  const peor = (fila: typeof resto, lado: number) => {
    const s = fila.reduce((a, i) => a + i.a, 0);
    const mx = Math.max(...fila.map((i) => i.a)), mn = Math.min(...fila.map((i) => i.a));
    return Math.max((lado * lado * mx) / (s * s), (s * s) / (lado * lado * mn));
  };
  while (resto.length) {
    const lado = Math.min(w, h);
    const fila = [resto[0]];
    let k = 1;
    while (k < resto.length && peor([...fila, resto[k]], lado) <= peor(fila, lado)) fila.push(resto[k++]);
    resto = resto.slice(k);
    const s = fila.reduce((a, i) => a + i.a, 0);
    if (w >= h) {
      const ancho = s / h;
      let yy = y;
      for (const i of fila) { const alto = i.a / ancho; out.push({ x, y: yy, w: ancho, h: alto, d: i.d }); yy += alto; }
      x += ancho; w -= ancho;
    } else {
      const alto = s / w;
      let xx = x;
      for (const i of fila) { const an = i.a / alto; out.push({ x: xx, y, w: an, h: alto, d: i.d }); xx += an; }
      y += alto; h -= alto;
    }
  }
  return out;
}

// ponytail: autocomprobación mínima — `npx tsx src/lib/treemap.ts`
if (typeof process !== "undefined" && process.argv[1]?.endsWith("treemap.ts")) {
  const r = squarify([6, 6, 4, 3, 2, 2, 1].map((v, i) => ({ v, d: i })), { x: 0, y: 0, w: 6, h: 4 });
  const area = r.reduce((a, q) => a + q.w * q.h, 0);
  console.assert(r.length === 7 && Math.abs(area - 24) < 1e-9 && r.every((q) => q.x >= -1e-9 && q.x + q.w <= 6 + 1e-9 && q.y + q.h <= 4 + 1e-9), "treemap");
  console.log("treemap ok");
}
