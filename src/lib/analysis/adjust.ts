import type { ValuationResult, LynchAssumptions, N } from "./types";
import { isNum, clamp } from "@/lib/format";
import { fairValueMedian, PE_MIN, PRUDENCIA } from "./forward";

export interface Adjusted {
  blended: N;
  fairPe: number;
  mos: N;
  implied: N;
  buyZone: { strong: N; gradual: N; fair: N };
  /** Valor del modelo adelantado solo (EPS próximo año × P/E justo), antes de la mediana con plataformas */
  modelo: N;
  dcf: N;
  historicalPe: N;
  /** Fuentes que entraron en la mediana, para medir si se contradicen */
  componentes: Array<{ fuente: string; valor: number }>;
}

/**
 * P/E justo del método: el crecimiento esperado RECORTADO por prudencia, entre el piso y el
 * tope. Tiene que ser exactamente la misma cuenta que `justifiedForwardPe` en el servidor:
 * si divergen, la tarjeta muestra un número y la API otro.
 */
export function fairPeFrom(a: LynchAssumptions): number {
  return clamp(a.growth * PRUDENCIA, PE_MIN, a.capPe);
}

/** Recalcula el Fair Value con los supuestos editados en el cliente, con la MISMA mediana que el servidor. */
export function adjustValuation(v: ValuationResult, a: LynchAssumptions): Adjusted {
  const fairPe = fairPeFrom(a);
  const modelo = a.eps > 0 ? a.eps * fairPe : null;
  const { fairValue: mediana, componentes } = fairValueMedian(modelo, v.platforms);
  // Misma regla que el servidor: sin modelo propio no hay Fair Value, solo referencias.
  const fv = isNum(modelo) ? mediana : null;
  const mos = isNum(fv) ? ((fv - v.price) / v.price) * 100 : null;
  const peNow = a.eps > 0 ? v.price / a.eps : null;
  return {
    blended: fv,
    fairPe,
    mos,
    implied: peNow,
    buyZone: { strong: isNum(fv) ? fv * 0.75 : null, gradual: isNum(fv) ? fv * 0.85 : null, fair: fv },
    modelo,
    dcf: v.intrinsic.dcf,
    historicalPe: v.intrinsic.historicalPe,
    componentes,
  };
}
