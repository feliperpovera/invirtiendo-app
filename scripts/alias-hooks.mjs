// Resuelve el alias "@/" del tsconfig y añade la extensión que TypeScript omite, para que
// node pueda importar los módulos de src/ sin compilar. Lo registra scripts/alias.mjs.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as unir } from "node:path";

const SRC = unir(dirname(fileURLToPath(import.meta.url)), "..", "src");
const conExtension = (base) => [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((p) => existsSync(p) && !existsSync(`${p}/.`));

export function resolve(especificador, contexto, siguiente) {
  let base = null;
  if (especificador.startsWith("@/")) base = unir(SRC, especificador.slice(2));
  else if (especificador.startsWith(".") && contexto.parentURL?.startsWith("file:")) base = unir(dirname(fileURLToPath(contexto.parentURL)), especificador);
  if (base) {
    const archivo = conExtension(base);
    if (archivo) return siguiente(pathToFileURL(archivo).href, contexto);
  }
  return siguiente(especificador, contexto);
}
