"use client";

import { useMemo, useState } from "react";
import { fmtBig, fmtMoney } from "@/lib/format";
import { Card, Eyebrow } from "@/components/ui";

/** Rentabilidades de referencia. Son promedios largos, no promesas: ningún año se parece al promedio. */
const REFERENCIAS = [
  { k: "conservador", label: "Conservador", tasa: 6, nota: "Mezcla de bonos y acciones" },
  { k: "sp500", label: "S&P 500", tasa: 10, nota: "Promedio histórico ~10% anual" },
  { k: "nasdaq", label: "Nasdaq-100", tasa: 13, nota: "Más rentabilidad, más caídas" },
  { k: "optimista", label: "Agresivo", tasa: 16, nota: "Exige acertar. Casi nadie lo sostiene" },
] as const;

interface Fila {
  anio: number;
  saldo: number;
  aportado: number;
  ganancia: number;
}

/**
 * Interés compuesto con aportes mensuales al final de cada mes.
 * La tasa mensual sale de la anual EFECTIVA ((1+r)^(1/12)−1), no de dividir entre 12:
 * dividir entre 12 infla el resultado porque ignora que el interés también se capitaliza.
 */
function proyectar(inicial: number, mensual: number, anios: number, tasaAnual: number): Fila[] {
  const i = Math.pow(1 + tasaAnual / 100, 1 / 12) - 1;
  const filas: Fila[] = [];
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

function Campo({
  label,
  valor,
  set,
  min,
  max,
  paso,
  prefijo,
  sufijo,
}: {
  label: string;
  valor: number;
  set: (v: number) => void;
  min: number;
  max: number;
  paso: number;
  prefijo?: string;
  sufijo?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[0.7rem] uppercase tracking-[0.12em] font-bold text-ink-soft" htmlFor={`c-${label}`}>
          {label}
        </label>
        <div className="flex items-baseline gap-1">
          {prefijo && <span className="num text-ink-soft">{prefijo}</span>}
          <input
            id={`c-${label}`}
            type="number"
            className="input num py-1 px-2 text-right w-28 text-lg font-bold"
            value={valor}
            min={min}
            step={paso}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) set(Math.max(min, Math.min(max, n)));
            }}
          />
          {sufijo && <span className="num text-ink-soft">{sufijo}</span>}
        </div>
      </div>
      <input
        type="range"
        aria-label={label}
        className="w-full mt-2 accent-[var(--terracotta)]"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => set(Number(e.target.value))}
      />
    </div>
  );
}

/** Barras apiladas por año: abajo lo que pusiste tú, arriba lo que puso el interés. */
function Grafico({ filas }: { filas: Fila[] }) {
  const max = Math.max(...filas.map((f) => f.saldo), 1);
  const n = filas.length;
  const W = 100;
  const H = 42;
  const hueco = n > 30 ? 0.12 : 0.28;
  const ancho = W / n;
  const barra = ancho * (1 - hueco);
  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-44 sm:h-56" role="img" aria-label="Aportes contra ganancia por interés compuesto, año a año">
        {filas.map((f, idx) => {
          const x = idx * ancho + (ancho - barra) / 2;
          const hTotal = (f.saldo / max) * H;
          const hAporte = (f.aportado / max) * H;
          return (
            <g key={f.anio}>
              <rect x={x} y={H - hTotal} width={barra} height={Math.max(0, hTotal - hAporte)} fill="var(--terracotta)" />
              <rect x={x} y={H - hAporte} width={barra} height={hAporte} fill="var(--olive-soft)" />
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 text-xs text-ink-soft mt-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: "var(--olive-soft)" }} /> Lo que pusiste tú
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-[3px]" style={{ background: "var(--terracotta)" }} /> Lo que puso el interés
        </span>
      </div>
    </div>
  );
}

export function Simulador() {
  const [inicial, setInicial] = useState(1000);
  const [mensual, setMensual] = useState(300);
  const [anios, setAnios] = useState(25);
  const [tasa, setTasa] = useState(10);
  const [inflacion, setInflacion] = useState(3);

  const filas = useMemo(() => proyectar(inicial, mensual, anios, tasa), [inicial, mensual, anios, tasa]);
  const fin = filas[filas.length - 1];
  const real = fin ? fin.saldo / Math.pow(1 + inflacion / 100, anios) : 0;
  // El año en que el interés compuesto aporta más que tú: el punto que vale contar.
  const cruce = filas.find((f) => f.ganancia > f.aportado)?.anio ?? null;
  const multiplo = fin && fin.aportado > 0 ? fin.saldo / fin.aportado : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Controles */}
        <Card className="lg:col-span-2 space-y-5">
          <Eyebrow>Tus números</Eyebrow>
          <Campo label="Aporte mensual" valor={mensual} set={setMensual} min={0} max={5000} paso={25} prefijo="$" />
          <Campo label="Con cuánto empiezas" valor={inicial} set={setInicial} min={0} max={100000} paso={500} prefijo="$" />
          <Campo label="Años invirtiendo" valor={anios} set={setAnios} min={1} max={50} paso={1} sufijo="años" />

          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.12em] font-bold text-ink-soft mb-2">Rentabilidad anual</p>
            <div className="grid grid-cols-2 gap-2">
              {REFERENCIAS.map((r) => (
                <button
                  key={r.k}
                  type="button"
                  onClick={() => setTasa(r.tasa)}
                  className={`rounded-xl px-3 py-2 text-left transition-colors border ${tasa === r.tasa ? "bg-ink text-cream border-ink" : "bg-cream-2 border-line text-ink hover:border-ink"}`}
                >
                  <span className="block text-sm font-bold">{r.label}</span>
                  <span className={`block num text-lg leading-none ${tasa === r.tasa ? "text-cream" : "text-terracotta"}`}>{r.tasa}%</span>
                  <span className={`block text-[0.68rem] leading-tight mt-1 ${tasa === r.tasa ? "text-[#c9c1b0]" : "text-ink-soft"}`}>{r.nota}</span>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Campo label="O pon la tuya" valor={tasa} set={setTasa} min={0} max={30} paso={0.5} sufijo="%" />
            </div>
          </div>

          <div className="pt-1 border-t border-line-soft">
            <Campo label="Inflación esperada" valor={inflacion} set={setInflacion} min={0} max={15} paso={0.5} sufijo="%" />
          </div>
        </Card>

        {/* Resultado */}
        <div className="lg:col-span-3 space-y-5">
          <Card ink>
            <Eyebrow>En {anios} {anios === 1 ? "año" : "años"} tendrías</Eyebrow>
            <p className="num font-display text-5xl sm:text-6xl leading-none mt-1">{fmtMoney(fin?.saldo ?? 0, 0)}</p>
            <p className="muted text-sm mt-2">
              Poder de compra de hoy: <b className="num text-cream">{fmtMoney(real, 0)}</b> descontando {inflacion}% de inflación al año.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-[#3a3831]">
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.12em] font-bold" style={{ color: "#b9b1a1" }}>
                  Pusiste tú
                </p>
                <p className="num text-xl font-bold leading-tight mt-0.5">{fmtMoney(fin?.aportado ?? 0, 0)}</p>
              </div>
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.12em] font-bold" style={{ color: "#e0a074" }}>
                  Puso el interés
                </p>
                <p className="num text-xl font-bold leading-tight mt-0.5" style={{ color: "#e8a877" }}>
                  {fmtMoney(fin?.ganancia ?? 0, 0)}
                </p>
              </div>
              <div>
                <p className="text-[0.68rem] uppercase tracking-[0.12em] font-bold" style={{ color: "#b9b1a1" }}>
                  Multiplicaste
                </p>
                <p className="num text-xl font-bold leading-tight mt-0.5">{multiplo.toFixed(1)}x</p>
              </div>
            </div>
          </Card>

          <Card>
            <Eyebrow>Año a año</Eyebrow>
            <div className="mt-3">
              <Grafico filas={filas} />
            </div>
            {cruce ? (
              <p className="text-sm mt-4 rounded-xl bg-terracotta-tint px-4 py-3">
                <b>En el año {cruce}</b> el interés compuesto empieza a poner más dinero que tú. A partir de ahí tu dinero trabaja más de lo que trabajas tú.
              </p>
            ) : (
              <p className="text-sm mt-4 text-ink-soft">
                Con estos números el interés todavía no supera a tus aportes. Alarga el plazo: el compuesto necesita tiempo, no montos.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <Eyebrow>Detalle</Eyebrow>
          <span className="text-xs text-ink-soft">Aportes al final de cada mes</span>
        </div>
        <div className="scroll-x mt-3">
          <table className="table min-w-[520px]">
            <thead>
              <tr>
                <th>Año</th>
                <th className="num">Aportado</th>
                <th className="num">Ganancia</th>
                <th className="num">Saldo</th>
                <th className="num">Poder de compra hoy</th>
              </tr>
            </thead>
            <tbody>
              {filas
                .filter((f) => anios <= 15 || f.anio % 5 === 0 || f.anio === anios || f.anio === 1)
                .map((f) => (
                  <tr key={f.anio}>
                    <td className="font-bold">{f.anio}</td>
                    <td className="num text-ink-soft">{fmtMoney(f.aportado, 0)}</td>
                    <td className="num" style={{ color: "var(--terracotta-deep)" }}>
                      {fmtMoney(f.ganancia, 0)}
                    </td>
                    <td className="num font-bold">{fmtMoney(f.saldo, 0)}</td>
                    <td className="num text-ink-soft">{fmtMoney(f.saldo / Math.pow(1 + inflacion / 100, f.anio), 0)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <Eyebrow>Lo que este número NO dice</Eyebrow>
        <ul className="mt-2 space-y-2 text-sm text-ink-soft">
          <li>
            <b className="text-ink">Ningún año se parece al promedio.</b> El S&P 500 promedia ~10% anual y aun así cayó 37% en 2008 y subió 29% en 2019. El promedio se cumple al final, no en el camino.
          </li>
          <li>
            <b className="text-ink">Aquí no hay impuestos ni comisiones.</b> Descuenta lo que te cobre tu bróker y lo que te cobre tu país al vender.
          </li>
          <li>
            <b className="text-ink">Los últimos años hacen casi todo el trabajo.</b> Por eso el mayor error no es elegir mal la acción: es empezar tarde o interrumpir los aportes.
          </li>
        </ul>
      </Card>
    </div>
  );
}
