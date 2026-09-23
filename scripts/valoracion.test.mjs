// Chequeo del modelo de valoración. Es la cuenta que decide si una acción sale en Buy Zone:
// si se rompe, la app recomienda comprar caro y nadie lo nota.
//   node --import ./scripts/alias.mjs scripts/valoracion.test.mjs
import assert from "node:assert/strict";
import { justifiedForwardPe, fairValueMedian, median, PE_MIN, PE_MAX, PRUDENCIA, RECORTE_OBJETIVO } from "../src/lib/analysis/forward.ts";
import { fairPeFrom } from "../src/lib/analysis/adjust.ts";

const cerca = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

// ── El P/E justo sale del crecimiento RECORTADO, no del crecimiento crudo
assert.ok(cerca(justifiedForwardPe(20), 20 * PRUDENCIA), "20% de crecimiento → 17x, no 20x");
assert.equal(justifiedForwardPe(100), PE_MAX, "por mucho que prometa, el techo manda");
assert.equal(justifiedForwardPe(2), PE_MIN, "por poco que crezca, el piso manda");
assert.equal(justifiedForwardPe(null), null);
assert.ok(justifiedForwardPe(25) < 25, "el múltiplo nunca iguala al crecimiento: ahí estaba el optimismo");

// ── Servidor y tarjeta tienen que dar EXACTAMENTE lo mismo (ya pasó una vez que no)
for (const g of [5, 12, 18, 23.7, 40, 80]) {
  const servidor = justifiedForwardPe(g);
  const tarjeta = fairPeFrom({ eps: 10, growth: g, dividendYield: 0, qualityBonus: 0, fairPe: 0, capPe: PE_MAX, epsSource: "forward" });
  assert.ok(cerca(servidor, tarjeta), `con ${g}% de crecimiento: servidor ${servidor} vs tarjeta ${tarjeta}`);
}

// ── El precio objetivo de los analistas entra recortado, y una sola vez
const plataformas = [
  { fuente: "GuruFocus", tipo: "modelo", valor: 100, url: "" },
  { fuente: "ValueInvesting.io", tipo: "modelo", valor: 80, url: "" },
  { fuente: "Yahoo · objetivo", tipo: "objetivo", valor: 200, url: "" },
  { fuente: "TradingView · objetivo", tipo: "objetivo", valor: 220, url: "" },
];
const { fairValue, componentes } = fairValueMedian(120, plataformas);
assert.equal(componentes.length, 4, "modelo + 2 plataformas + UN objetivo (los objetivos cuentan una vez)");
const obj = componentes.find((c) => c.fuente.includes("objetivo"));
assert.ok(cerca(obj.valor, 210 * RECORTE_OBJETIVO), `el objetivo entra recortado: ${obj.valor} debería ser ${210 * RECORTE_OBJETIVO}`);
assert.ok(cerca(fairValue, median([120, 100, 80, 210 * RECORTE_OBJETIVO])), "el Fair Value es la mediana de los cuatro");

// ── Sin modelo propio (no hay EPS estimado) el Fair Value sale solo de las otras fuentes
const soloFuera = fairValueMedian(null, plataformas);
assert.equal(soloFuera.componentes.length, 3);
assert.ok(soloFuera.fairValue > 0);

// ── El recorte hace el modelo MÁS conservador que el método puro (crecimiento = múltiplo)
const puro = (g, eps) => Math.min(28, Math.max(12, g)) * eps;
for (const g of [15, 20, 30, 50]) {
  assert.ok(justifiedForwardPe(g) * 10 < puro(g, 10), `con ${g}% el modelo nuevo tiene que valorar por debajo del viejo`);
}

console.log(`valoracion.test: ok · P/E ${PE_MIN}-${PE_MAX}x · prudencia ${PRUDENCIA} · recorte objetivo ${RECORTE_OBJETIVO}`);

// ── Sin modelo propio (la empresa no gana dinero) no se publica Fair Value: las fuentes de
//    afuera quedan de referencia. Antes, Rivian salía "140% barata" por un DCF ajeno.
import { adjustValuation } from "../src/lib/analysis/adjust.ts";
import { fuentesDeAcuerdo, DISPERSION_MAX } from "../src/lib/analysis/forward.ts";
const base = { price: 15, platforms: [{ fuente: "ValueInvesting.io", tipo: "modelo", valor: 56.7, url: "" }, { fuente: "Yahoo · objetivo", tipo: "objetivo", valor: 17.1, url: "" }], intrinsic: { dcf: null, historicalPe: null } };
const sinUtilidades = adjustValuation(base, { eps: 0, growth: 15.8, dividendYield: 0, qualityBonus: 0, fairPe: 0, capPe: PE_MAX, epsSource: "forward" });
assert.equal(sinUtilidades.blended, null, "sin EPS estimado positivo no hay Fair Value");
assert.equal(sinUtilidades.mos, null, "y por tanto tampoco hay Margin of Safety");
const conUtilidades = adjustValuation(base, { eps: 2, growth: 20, dividendYield: 0, qualityBonus: 0, fairPe: 0, capPe: PE_MAX, epsSource: "forward" });
assert.ok(conUtilidades.blended > 0, "con EPS positivo sí hay Fair Value");

// ── Fuentes que se contradicen: el descuento no se firma
assert.equal(fuentesDeAcuerdo([{ valor: 100 }, { valor: 130 }], 115), true, "30% de diferencia es tolerable");
assert.equal(fuentesDeAcuerdo([{ valor: 185 }, { valor: 3443 }], 1361), false, `${DISPERSION_MAX}%: el caso Micron no pasa`);
assert.equal(fuentesDeAcuerdo([{ valor: 100 }], 100), true, "una sola fuente no se contradice consigo misma");
assert.equal(fuentesDeAcuerdo([], null), true, "sin fuentes no se bloquea nada");
const { signalFor } = await import("../src/lib/analysis/score.ts");
assert.equal(signalFor(40, false, true).label, "Strong Buy");
assert.equal(signalFor(40, false, false).label, "Watch", "con fuentes en desacuerdo, un +40% no es Strong Buy");
assert.equal(signalFor(-50, false, false).label, "Avoid", "el desacuerdo no salva a una acción cara");
assert.equal(signalFor(null, false).label, "Sin Fair Value");
console.log("valoracion.test: ok · sin utilidades no hay Fair Value · dispersión > " + DISPERSION_MAX + "% no firma compra");
