// Chequeo del Portafolio Invirtiendoo contra el S&P 500. Es un número que se publica en la
// portada: si la cuenta se rompe, la gente ve un rendimiento que no existe.
//   node --import ./scripts/alias.mjs scripts/portafolio.test.mjs
import assert from "node:assert/strict";
import { compararConIndice, compararHistoria, inicioRango, aDia, sesionAnterior, completarSesion, agregarVivo } from "../src/lib/analysis/portafolio.ts";

const cerca = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;
const serie = (...cs) => ({ points: cs.map((c, i) => ({ t: i * 1000, c })) });

// Historia de IBKR: un solo índice TWR con peso 100 sigue exactamente su propio rendimiento
const ibkr = compararConIndice(serie(100, 105, 110), [{ ticker: "IBKR", peso: 100, serie: serie(1.2, 1.26, 1.32) }]);
assert.ok(cerca(ibkr.retorno.portafolio, 10) && cerca(ibkr.retorno.indice, 10), "el índice TWR base 1.2 → +10%");

// Comprado al inicio y sin rebalanceo: A duplica y B se queda quieta → 50/50 da +50%
const r = compararConIndice(serie(100, 110, 120), [
  { ticker: "A", peso: 50, serie: serie(10, 15, 20) },
  { ticker: "B", peso: 50, serie: serie(40, 40, 40) },
]);
assert.ok(cerca(r.retorno.portafolio, 50), `portafolio ${r.retorno.portafolio}`);
assert.ok(cerca(r.retorno.indice, 20), `índice ${r.retorno.indice}`);
assert.ok(cerca(r.puntos[0].portafolio, 100) && cerca(r.puntos[0].indice, 100), "todo arranca en 100");

// Una posición que empieza a cotizar a mitad del periodo queda fuera y su peso se reparte
const tarde = compararConIndice(serie(100, 100, 100, 100), [
  { ticker: "A", peso: 60, serie: serie(10, 11, 12, 13) },
  { ticker: "NUEVA", peso: 40, serie: { points: [{ t: 2000, c: 5 }, { t: 3000, c: 50 }] } },
]);
assert.deepEqual(tarde.excluidas, ["NUEVA"]);
assert.ok(cerca(tarde.incluidas[0].peso, 100), "A se queda con todo el peso");
assert.ok(cerca(tarde.retorno.portafolio, 30), "la subida de 10x de la que no existía no cuenta");

// Una barra que falta se rellena con el último precio conocido, no con cero
const hueco = compararConIndice(serie(100, 100, 100), [{ ticker: "A", peso: 100, serie: { points: [{ t: 0, c: 10 }, { t: 2000, c: 12 }] } }]);
assert.ok(cerca(hueco.puntos[1].portafolio, 100), "en el hueco repite el último precio");

// En intradía la base es el cierre anterior: el % del día coincide con la variación publicada
const hoy = compararConIndice({ points: [{ t: 0, c: 101 }, { t: 1000, c: 102 }], base: 100 }, [
  { ticker: "A", peso: 100, serie: { points: [{ t: 0, c: 50.5 }, { t: 1000, c: 51 }], base: 50 } },
]);
assert.ok(cerca(hoy.retorno.indice, 2) && cerca(hoy.retorno.portafolio, 2));
assert.ok(cerca(hoy.puntos[0].indice, 101), "el primer punto ya muestra el salto de la apertura");

// Sin datos del índice no se inventa nada
assert.equal(compararConIndice({ points: [] }, [{ ticker: "A", peso: 100, serie: serie(1, 2) }]), null);

// ── Historia real: IBKR va por días hábiles con feriados repetidos; Yahoo trae la barra de hoy
const D = (f) => Date.parse(`${f}T00:00:00Z`);
const sp = [["2026-08-28", 100], ["2026-08-31", 101], ["2026-09-01", 102], ["2026-09-02", 104], ["2026-09-03", 999]] // la última es "hoy", aún sin dato de IBKR
  .map(([f, c]) => ({ t: D(f) + 13.5 * 3600000, c })).map((p) => ({ t: aDia(p.t), c: p.c }));
const ib = [["2026-08-28", 1.0], ["2026-08-31", 1.02], ["2026-09-01", 1.03], ["2026-09-02", 1.1]].map(([f, c]) => ({ t: D(f), c }));
const h = compararHistoria(sp, ib, D("2026-08-30")); // arranca un domingo: base = viernes 28
assert.equal(h.inicioPortafolio, null);
assert.ok(cerca(h.retorno.portafolio, 10), `IBKR del 28-ago al 2-sep = +10%, dio ${h.retorno.portafolio}`);
assert.ok(cerca(h.retorno.indice, 4), "el S&P se corta en el último cierre de IBKR, no toma la barra de hoy");
assert.equal(h.puntos.length, 4);
// Inicio de cada periodo desde el último cierre
assert.equal(inicioRango("1M", D("2026-09-22")), D("2026-08-22"));
assert.equal(inicioRango("YTD", D("2026-09-22")), D("2025-12-31"));
assert.equal(inicioRango("5A", D("2026-09-22")), D("2021-09-22"));
assert.equal(inicioRango("3M", D("2026-05-31")), D("2026-03-03"), "31 de mayo menos 3 meses se desborda a marzo sin romperse");

// ── Periodo más largo que la cuenta: S&P completo, portafolio anclado en su primer día
const spLargo = [["2021-09-22", 100], ["2023-09-22", 150], ["2025-12-12", 200], ["2026-06-01", 210], ["2026-09-22", 220]].map(([f, c]) => ({ t: D(f), c }));
const ibLargo = [["2025-12-12", 1.0], ["2026-06-01", 1.2], ["2026-09-22", 1.3]].map(([f, c]) => ({ t: D(f), c }));
const largo = compararHistoria(spLargo, ibLargo, D("2021-09-22"));
assert.equal(largo.puntos[0].portafolio, null, "antes de la cuenta no hay portafolio");
assert.equal(largo.inicioPortafolio, D("2025-12-12"));
assert.ok(cerca(largo.ancla, 200) && cerca(largo.puntos[2].portafolio, 200), "arranca pegado a la línea del S&P");
assert.ok(cerca(largo.retorno.indice, 120), "el S&P muestra sus 5 años: +120%");
assert.ok(cerca(largo.retorno.portafolio, 30), "el portafolio, desde que existe: +30%");
assert.ok(cerca(largo.retorno.indiceComun, 10), "el S&P en ese mismo tramo: +10% (contra esto se compara)");
const largoVivo = agregarVivo(largo, D("2026-09-22"), D("2026-09-22"), { t: D("2026-09-23") + 3600000, dia: D("2026-09-23"), spAnterior: 220, spAhora: 242, factor: 1.1 });
assert.ok(cerca(largoVivo.comp.retorno.portafolio, (1.3 * 1.1 - 1) * 100) && cerca(largoVivo.comp.retorno.indiceComun, 21), "el punto en vivo respeta el ancla");

// ── En vivo. Caso real del 23 sep: Yahoo trae la barra del 22 sin cierre y la historia perdía ese día.
const barras = ["2026-09-18", "2026-09-21", "2026-09-22", "2026-09-23"].map((f) => D(f) + 13.5 * 3600000);
const hoyDia = D("2026-09-23");
assert.equal(sesionAnterior(barras, hoyDia), D("2026-09-22"), "la sesión anterior sale de las barras, tengan o no cierre");
const spSinCierre = [{ t: D("2026-09-18"), c: 100 }, { t: D("2026-09-21"), c: 101 }, { t: D("2026-09-23"), c: 99 }];
const spCompleto = completarSesion(spSinCierre, D("2026-09-22"), 102);
assert.deepEqual(spCompleto.map((p) => p.c), [100, 101, 102, 99], "el 22 entra con el cierre anterior del intradía");
assert.equal(completarSesion(spCompleto, D("2026-09-22"), 555), spCompleto, "si la barra ya tiene cierre no se toca");

const ibk = [["2026-09-18", 1.0], ["2026-09-21", 1.01], ["2026-09-22", 1.05]].map(([f, c]) => ({ t: D(f), c }));
const base = compararHistoria(spCompleto, ibk, D("2026-09-18"));
assert.ok(cerca(base.retorno.portafolio, 5) && cerca(base.retorno.indice, 2), "con el 22 completo la historia llega al último cierre de IBKR");
const vivo = { t: D("2026-09-23") + 15 * 3600000, dia: hoyDia, spAnterior: 102, spAhora: 102 * 0.99, factor: 1.02 };
const conVivo = agregarVivo(base, D("2026-09-22"), D("2026-09-22"), vivo);
assert.ok(conVivo.enVivo);
assert.ok(cerca(conVivo.comp.retorno.portafolio, (1.05 * 1.02 - 1) * 100), "el portafolio suma el movimiento de hoy sobre el TWR oficial");
assert.ok(cerca(conVivo.comp.retorno.indice, (1.02 * 0.99 - 1) * 100), "el S&P también");
// IBKR atrasado (último cierre el 21 y hoy es 23): no se pega el día de hoy sobre un hueco
assert.equal(agregarVivo(base, D("2026-09-21"), D("2026-09-22"), vivo).enVivo, false);
// Antes de abrir, el intradía es la sesión que IBKR ya tiene: nada que agregar
assert.equal(agregarVivo(base, D("2026-09-22"), D("2026-09-21"), { ...vivo, dia: D("2026-09-22") }).enVivo, false);

console.log("portafolio.test: ok");
