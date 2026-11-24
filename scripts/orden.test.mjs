import assert from "node:assert";
import { ordenar } from "../src/lib/orden.ts";
const f = [3, null, 1, NaN, 2], id = (x) => x;
assert.deepEqual(ordenar(f, id, true).slice(0, 3), [3, 2, 1]);
assert.deepEqual(ordenar(f, id, false).slice(0, 3), [1, 2, 3]);
assert.deepEqual(ordenar(["b", "", "a"], id, true), ["b", "a", ""]);
assert.deepEqual(f[0], 3);
console.log("orden ok");
