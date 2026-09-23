// Chequeo del interés compuesto del simulador. Es lógica de dinero: si se rompe, el
// número que sale en pantalla es mentira y nadie lo nota.
//   node scripts/simulador.test.mjs
import assert from "node:assert/strict";

/** Copia exacta de la proyección de src/components/Simulador.tsx */
function proyectar(inicial, mensual, anios, tasaAnual) {
  const i = Math.pow(1 + tasaAnual / 100, 1 / 12) - 1;
  const filas = [];
  let saldo = inicial;
  let aportado = inicial;
  for (let a = 1; a <= anios; a++) {
    for (let m = 0; m < 12; m++) {
      saldo = saldo * (1 + i) + mensual;
      aportado += mensual;
    }
    filas.push({ anio: a, saldo, aportado, ganancia: saldo - aportado });
  }
  return filas;
}

const ultima = (...args) => proyectar(...args).at(-1);

// Sin rentabilidad, el saldo es exactamente lo aportado.
{
  const f = ultima(1000, 300, 10, 0);
  assert.equal(f.aportado, 1000 + 300 * 120);
  assert.ok(Math.abs(f.saldo - f.aportado) < 1e-9, "con 0% el interés debe ser cero");
}

// Coincide con la fórmula cerrada del valor futuro de una anualidad vencida.
{
  const [inicial, mensual, anios, tasa] = [1000, 300, 25, 10];
  const i = Math.pow(1 + tasa / 100, 1 / 12) - 1;
  const n = anios * 12;
  const cerrada = inicial * Math.pow(1 + i, n) + mensual * ((Math.pow(1 + i, n) - 1) / i);
  assert.ok(Math.abs(ultima(inicial, mensual, anios, tasa).saldo - cerrada) < 1e-6, "debe cuadrar con la fórmula cerrada");
}

// La tasa mensual sale de la anual EFECTIVA: sin aportes, un año al 10% da exactamente 10%.
{
  const f = ultima(1000, 0, 1, 10);
  assert.ok(Math.abs(f.saldo - 1100) < 1e-9, `un año al 10% sobre 1000 debe dar 1100, dio ${f.saldo}`);
}

// Más años nunca puede dar menos saldo con tasa positiva.
{
  const a = ultima(0, 100, 10, 8).saldo;
  const b = ultima(0, 100, 20, 8).saldo;
  assert.ok(b > a * 2, "veinte años debe superar con holgura al doble de diez");
}

// El cruce (el interés aporta más que tú) existe y llega después del primer año.
{
  const f = proyectar(1000, 300, 40, 10);
  const cruce = f.find((x) => x.ganancia > x.aportado)?.anio;
  assert.ok(cruce && cruce > 1 && cruce < 40, `cruce fuera de rango: ${cruce}`);
}

console.log("simulador: 5/5 ✓");
