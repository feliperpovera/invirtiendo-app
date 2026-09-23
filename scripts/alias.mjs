// Engancha el resolutor del alias "@/" antes de correr un test:
//   node --import ./scripts/alias.mjs scripts/valoracion.test.mjs
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
