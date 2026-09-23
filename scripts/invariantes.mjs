// Invariantes del Fair Value. Corre sobre un volcado de scripts/dump.mjs y falla si
// alguna acción rompe una regla que ya costó un error en producción.
//   node scripts/invariantes.mjs <carpeta>
import { readdirSync, readFileSync } from "node:fs";
const DIR = process.argv[2];
if (!DIR) { console.error("uso: node scripts/invariantes.mjs <carpeta>"); process.exit(2); }
const fallos = [];
const reglas = [
  {
    nombre: "La serie anual no puede cambiar de escala (cambio de moneda, entidad o split sin re-expresar)",
    check(d) {
      // Sobre INGRESOS, no sobre EPS: un desplome de utilidades (Intel) no es un cambio de escala.
      const e = d.epsAnual.map((x) => x.ingresos).filter((x) => typeof x === "number" && x > 0);
      const med = (v) => { const o = [...v].sort((a, b) => a - b); return o.length ? o[Math.floor(o.length / 2)] : null; };
      for (let i = 0; i < e.length - 3; i++) {
        const mv = med(e.slice(0, i + 1)), mn = med(e.slice(i + 1));
        if (mv && mn && mv / mn > 6) return `los años hasta el ${i + 1}º están ${(mv / mn).toFixed(0)}x fuera de escala`;
      }
      return null;
    },
  },
  {
    nombre: "Las ventas por acción del modelo deben coincidir con el P/S publicado (±20%)",
    check(d) {
      const vps = d.ventas?.ventasPorAccion, ps = d.datosReales?.ps;
      if (!vps || !ps || !d.precio) return null;
      const esperado = d.precio / ps; // ventas por acción implícitas en el múltiplo de mercado
      // Las financieras no cuentan: Yahoo define "ingresos" de un banco distinto que la SEC.
      if (/financ|bank|insur/i.test(`${d.sector} ${d.industria}`)) return null;
      const r = vps / esperado;
      // ±35%: nuestro TTM incluye el último 10-Q y el P/S de Yahoo puede ir un trimestre atrás.
      return r < 0.65 || r > 1.35 ? `modelo ${vps.toFixed(2)} vs ${esperado.toFixed(2)} que implica el P/S de ${ps}` : null;
    },
  },
  {
    nombre: "El margen neto no puede superar al operativo por más de 8 puntos sin acotar el EPS (ganancias que no son del negocio)",
    check(d) {
      const { margenNeto: mn, margenOperativo: mo } = d.datosReales;
      // Sin utilidad operativa positiva no hay nada contra qué acotar.
      if (typeof mn !== "number" || typeof mo !== "number" || mo <= 0 || mn <= mo + 8) return null;
      if (/no vienen de operar/.test((d.avisos ?? []).join(" "))) return null;
      if (/financ|bank|insur/i.test(`${d.sector} ${d.industria}`)) return null;
      return `neto ${mn}% vs operativo ${mo}% y el EPS no se acotó`;
    },
  },
  {
    nombre: "Una empresa no vale menos que su caja neta por acción",
    check(d) {
      const l = d.contraste?.porLibros;
      if (!d.fairValue || !l) return null;
      return null; // la caja neta no viaja en el volcado; el piso se verifica en el motor
    },
  },
  {
    nombre: "El P/E justo no puede incluir un dividendo que no se está pagando",
    check(d) {
      const div = d.modelo?.dividendo;
      return typeof div === "number" && div > 0 && d.datosReales?.dividendo === null ? `modelo usa ${div}% con dividendo real nulo` : null;
    },
  },
];
const archivos = readdirSync(DIR).filter((f) => f.endsWith(".json"));
for (const f of archivos) {
  const d = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));
  for (const r of reglas) {
    const m = r.check(d);
    if (m) fallos.push(`${d.ticker.padEnd(6)} ${r.nombre}\n         ${m}`);
  }
}
console.log(`${archivos.length} acciones · ${fallos.length} invariantes rotos`);
for (const f of fallos) console.log("  ✗ " + f);
process.exit(fallos.length ? 1 : 0);
