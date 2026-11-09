// Ranking diario (lo corre .github/workflows/tareas.yml): evalúa en Node cada acción pendiente y la guarda en Supabase.
// Va aquí y no en el worker porque el plan gratis de Cloudflare corta cada petición a los 10 ms de CPU.
//   node --import ./scripts/alias.mjs scripts/ranking.mjs
import { evaluate } from "@/lib/evaluate";
import { guardarRanking, rankingPendientes } from "@/lib/providers/ranking";

const LIMITE_MS = 5 * 3600_000;
const inicio = Date.now();
const cola = await rankingPendientes(Number(process.env.HORAS ?? 20));
const total = cola.length;
let ok = 0;
const fallidas = [];
const obrero = async () => {
  while (cola.length && Date.now() - inicio < LIMITE_MS) {
    const t = cola.shift();
    try {
      await guardarRanking(await evaluate(t));
      ok++;
    } catch (e) {
      fallidas.push(t);
    }
    if ((ok + fallidas.length) % 25 === 0) console.log(`${ok + fallidas.length}/${total} · ok ${ok} · fallidas ${fallidas.length}`);
  }
};
await Promise.all(Array.from({ length: 4 }, obrero));
console.log(`Listo: ${ok}/${total} evaluadas · fallidas: ${fallidas.join(",") || "ninguna"}`);
process.exit(0);
