// Chequeo de qué reevalúa el job diario del ranking. Si esto se rompe, o el cron se queda
// sin trabajo (ranking viejo) o reintenta lo mismo para siempre (cadena infinita).
//   node scripts/ranking.test.mjs
import assert from "node:assert/strict";
import { pendientes, UNIVERSO } from "../src/lib/universo.ts";

const H = 3600_000;
const ahora = Date.parse("2026-09-15T22:00:00Z");
const hace = (horas) => new Date(ahora - horas * H).toISOString();
const filas = [
  { ticker: "NVDA", actualizado: hace(2) }, // fresca
  { ticker: "AAPL", actualizado: hace(25) }, // vencida
  { ticker: "META", actualizado: hace(30) }, // más vencida aún
  { ticker: "ZZZZ", actualizado: hace(40) }, // fuera del universo, pero está en la tabla: también se refresca
];

// Vencidas de más vieja a más nueva; la fresca no entra
assert.deepEqual(pendientes(filas, [], [], 20, ahora), ["ZZZZ", "META", "AAPL"]);
// Lo del universo que no está en la tabla va primero
assert.deepEqual(pendientes(filas, ["GOOGL", "NVDA"], [], 20, ahora), ["GOOGL", "ZZZZ", "META", "AAPL"]);
// Lo que ya falló hoy no se reintenta
assert.deepEqual(pendientes(filas, ["GOOGL"], ["meta", "GOOGL"], 20, ahora), ["ZZZZ", "AAPL"]);
// Todo fresco = nada que hacer (el cron termina sin encadenar)
assert.deepEqual(pendientes(filas.map((f) => ({ ...f, actualizado: hace(1) })), ["NVDA"], [], 20, ahora), []);
// El universo no tiene repetidos ni tickers en minúscula
assert.equal(new Set(UNIVERSO).size, UNIVERSO.length);
assert.ok(UNIVERSO.every((t) => t === t.toUpperCase()));

console.log(`ranking.test: ok (${UNIVERSO.length} acciones en el universo)`);
