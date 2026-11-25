import assert from "node:assert";
import { ganaHoy, diaNY } from "../src/lib/hoy.ts";
const op = (tipo, cantidad, precio) => ({ fecha: "", ticker: "", tipo, cantidad, precio });
assert.deepEqual(ganaHoy(10, 9, 10, []), { gana: -10, base: 100 });
assert.deepEqual(ganaHoy(12, 9, 10, [op("compra", 2, 9)]), { gana: -10, base: 118 }); // lo comprado hoy no carga la caída previa
assert.deepEqual(ganaHoy(8, 9, 10, [op("venta", 2, 11)]), { gana: -6, base: 100 }); // -8 de lo que queda, +2 de la venta
assert.equal(diaNY(Date.parse("2026-11-26T02:00:00Z")), "2026-11-25");
console.log("hoy ok");
