import type { BuffettResult, BuffettFilter, PillarResult, ValuationResult, Verdict, CheckItem } from "./types";
import { fmtMoney, isNum } from "@/lib/format";

/**
 * Seis pilares, todos objetivos. Cada uno "cumple" o "no cumple" según sus umbrales
 * numéricos; no hay preguntas al usuario ni filtro de "tesis": se asume que quien
 * mira la acción ya entiende el negocio.
 */

/** Veredicto a partir de los ítems medibles: todos pasan → cumple · alguno falla → no cumple · sin datos → sin dato. */
function veredictoObjetivo(items: CheckItem[], propio: Verdict, auto: boolean): { verdict: Verdict; items: CheckItem[] } {
  const medibles = items.filter((it) => it.pass !== null);
  if (auto) return { verdict: propio, items: medibles };
  if (!medibles.length) return { verdict: "DUDOSO", items: [] };
  if (medibles.some((it) => it.pass === false)) return { verdict: "FALLA", items: medibles };
  return { verdict: "PASA", items: medibles };
}

export function verdictFromFilters(filters: BuffettFilter[], gradualZone: number | null): Pick<BuffettResult, "passed" | "failedCore" | "verdict" | "verdictText"> & { filters: BuffettFilter[] } {
  const core = filters.filter((f) => f.n <= 5);
  const price = filters.find((f) => f.n === 6);
  const coreFail = core.some((x) => x.verdict === "FALLA");
  const coreAllPass = core.every((x) => x.verdict === "PASA");
  const passed = filters.filter((x) => x.verdict === "PASA").length;

  let verdict: BuffettResult["verdict"];
  let verdictText: string;
  if (coreFail) {
    verdict = "DISCARD";
    const failed = core.filter((x) => x.verdict === "FALLA").map((x) => `${x.n} ${x.title}`).join(", ");
    verdictText = `No cumple: ${failed}. No es núcleo; como satélite, tamaño pequeño y la señal la da el precio.`;
  } else if (coreAllPass && price?.verdict === "PASA") {
    verdict = "BUY";
    verdictText = "Cumple los seis pilares: comprar por tramos siguiendo el plan.";
  } else if (coreAllPass) {
    verdict = "WATCHLIST";
    verdictText = isNum(gradualZone) ? `Cumple la calidad, no el precio. Activar compra si llega a ${fmtMoney(gradualZone)} (15% bajo el Fair Value).` : "Cumple la calidad, pero no hay Fair Value fiable para fijar buy zone.";
  } else {
    verdict = "REVIEW";
    verdictText = "Algún pilar queda sin dato suficiente para decidir: revisa los umbrales que no se pudieron medir.";
  }
  return { filters, passed, failedCore: coreFail, verdict, verdictText };
}

export function buildBuffett(p: {
  business: PillarResult;
  moat: PillarResult;
  quality: PillarResult;
  management: PillarResult;
  durability: PillarResult;
  valuation: ValuationResult;
}): BuffettResult {
  const f = (n: number, key: string, title: string, question: string, pr: PillarResult, auto: boolean): BuffettFilter => {
    const v = veredictoObjetivo(pr.items, pr.verdict, auto);
    return { n, key, title, question, verdict: v.verdict, auto: true, reason: pr.summary, items: v.items };
  };
  const filters: BuffettFilter[] = [
    f(1, "business", "Negocio", "Gana dinero, tiene escala e historia", p.business, false),
    f(2, "moat", "Moat", "Márgenes altos y estables, ROIC alto", p.moat, true),
    f(3, "quality", "Números", "Los cinco umbrales de un gran negocio", p.quality, true),
    f(4, "management", "Dueños", "Recompras, dilución, retorno de capital, insiders", p.management, true),
    f(5, "durability", "Durabilidad", "Crecimiento sostenido y sin años caóticos", p.durability, false),
    f(6, "valuation", "Precio", "Margin of Safety frente al Fair Value", p.valuation, true),
  ];
  const r = verdictFromFilters(filters, p.valuation.buyZone.gradual);
  return { filters: r.filters, passed: r.passed, failedCore: r.failedCore, verdict: r.verdict, verdictText: r.verdictText };
}
