import type { Metadata } from "next";
import { Card, Eyebrow } from "@/components/ui";

export const metadata: Metadata = { title: "Método y glosario" };

const GLOSSARY: Array<{ group: string; rows: Array<[string, string]> }> = [
  {
    group: "Valoración",
    rows: [
      ["Fair Value", "Lo que vale la acción según sus utilidades: EPS × P/E justo (crecimiento + dividendo + calidad). Es una estimación, no una verdad: depende de los supuestos, que puedes mover."],
      ["Margin of Safety", "(Fair Value − Precio) ÷ Precio. Regla del proceso: ≥15% Buy Zone (≥25% Strong Buy) · entre −10% y 15% Watch · por debajo, Wait/Avoid."],
      ["DCF", "Proyectar el flujo de caja libre y traerlo a valor presente. Lo usamos como contraste del Fair Value, no como base."],
      ["Tasa de descuento", "Rentabilidad mínima que exiges por el riesgo. 8.5-9.5% MAG7 · 10-12% cíclicas/especulativas. Sube cuando suben los bonos del Tesoro."],
      ["Crecimiento terminal", "Ritmo al que crecerá la empresa 'para siempre' tras los 10 años proyectados (2.5-3%, cercano al PIB nominal)."],
      ["FCF", "Flujo de caja libre: efectivo tras operaciones e inversiones (CapEx). El dinero 'de verdad' para recompras, dividendos o crecimiento."],
    ],
  },
  {
    group: "Múltiplos",
    rows: [
      ["P/E", "Precio ÷ utilidad por acción (12 meses). 30x es caro para quien crece 8%, barato para quien crece 40%."],
      ["Forward P/E", "Igual, con la utilidad esperada de los próximos 12 meses. Cuidado en cíclicas: un forward P/E bajísimo puede señalar pico de ciclo."],
      ["PEG", "P/E ÷ crecimiento esperado. <1 suele ser barato, >2 caro. Menor PEG es una señal, no una conclusión."],
      ["EV/EBITDA · P/S · P/FCF", "Variantes útiles cuando la utilidad contable engaña o no existe aún."],
      ["Múltiplo histórico", "Comparar el múltiplo actual contra su propio promedio de 5-10 años. MSFT a 24x forward vs 30x+ histórico fue señal de compra."],
    ],
  },
  {
    group: "Calidad del negocio",
    rows: [
      ["ROE / ROIC", "Retorno sobre patrimonio / capital invertido. ROIC alto y sostenido = negocio de calidad con ventaja competitiva."],
      ["Márgenes", "Porcentaje de las ventas que sobrevive tras costos. Altos y estables indican poder de precios."],
      ["Moat (moat)", "Lo que impide que la competencia erosione el negocio: efectos de red (META), costos de cambio (MSFT), monopolio técnico (ASML), escala (AMZN)."],
      ["Caja neta / deuda neta", "Efectivo menos deuda. Caja neta = fortaleza. Deuda alta = fragilidad ante tasas altas."],
      ["CapEx", "Inversión en activos físicos. El debate de 2026: el capex IA de los hyperscalers, ¿inversión con retorno o gasto sin freno?"],
    ],
  },
  {
    group: "Macro y mercado",
    rows: [
      ["Bono a 10 años", "La tasa 'libre de riesgo'. Cuando sube, comprime los múltiplos de todo el mercado. Es el rival de las acciones."],
      ["VIX", "Volatilidad implícita. ~14 complacencia · >25 miedo (y usualmente, oportunidades)."],
      ["Value trap", "Acción que parece barata por múltiplos pero cuyo negocio se deteriora. Barata hoy, más barata mañana."],
      ["Cíclica", "Resultados que suben y bajan con ciclos (memoria: MU, SNDK). Sus múltiplos bajos en la cima engañan."],
    ],
  },
  {
    group: "Tu operativa",
    rows: [
      ["Compra por tramos", "Dividir el capital en 2-4 compras a precios distintos. Reduce el riesgo de comprar el pico."],
      ["Entrada inicial pequeña", "25-33% del monto objetivo para 'tener piel' en una tesis de más riesgo. Se amplía solo si la tesis se confirma."],
      ["Núcleo vs satélite", "Núcleo: ETFs y MAG7 de calidad (el grueso). Satélite: apuestas de mayor riesgo, tamaño pequeño (≤3-4%)."],
      ["Riesgo de evento", "No ampliar justo antes de earnings o Fed; comprar la reacción."],
      ["EM / EA", "Tasa efectiva mensual/anual: EM=(1+r)^(30/días)−1 · EA=(1+r)^(365/días)−1."],
    ],
  },
];

const STEPS: Array<[string, string, string]> = [
  ["Filtro de universo", "¿qué miro?", "Núcleo: MAG7 + ETFs (QQQM, SPYM, SMH). Satélites: solo empresas con crecimiento >15%, márgenes altos o mejorando, balance sólido y un catalizador identificable. Si no puedes explicar en una frase por qué el mundo necesita más de esa empresa en 5 años, fuera."],
  ["Valoración", "¿cuánto vale?", "Fair Value por DCF simplificado + contraste con múltiplos (P/E, forward P/E, PEG vs pares y vs su propio histórico). Anotar SIEMPRE los supuestos. Desconfiar de márgenes >40%."],
  ["Clasificación y señal", "¿qué hago?", "Margin of Safety ≥15% Buy Zone · ≥25% Strong Buy · −10% a 15% Watch · negativo Wait · muy negativo Avoid. La señal la da el margen, no el titular ni el momentum."],
  ["Tamaño de posición", "¿cuánto compro?", "Regla 60/30/10: ~60% núcleo ETF, ~30% MAG7 con descuento, ~10% máximo en satélites (ninguna >3-4%). Cíclicas y deep value: mitad del tamaño. La liquidez es una posición."],
  ["Ejecución por tramos", "¿cómo compro?", "Definir ANTES: monto total, número de tramos (2-4) y precios (1/3 ahora, 1/3 si cae 5-7%, 1/3 si cae 12-15%). Órdenes límite. Nunca ampliar justo antes de eventos binarios. Si se escapa, no perseguir."],
  ["Seguimiento semanal", "¿cómo vigilo?", "Informe de los jueves: precios vs Fair Value, novedades de tesis, seguimiento de recomendaciones. Revisar el Fair Value solo cuando cambian los fundamentales, no porque el precio se movió."],
  ["Revisión de tesis", "¿cuándo cambio de opinión?", "Congelar aportes si: falla su guía 2 trimestres seguidos · el catalizador desaparece · la deuda crece más rápido que el negocio · en cíclicas, los precios del producto se dan vuelta."],
  ["Higiene emocional", "las reglas de oro", "1) La señal la da el margen, nunca el FOMO. 2) No perseguir nada que subió >20% en un mes. 3) Las caídas son tu amiga. 4) Diversificar catalizadores, no solo tickers. 5) Máximo 1-2 decisiones por semana. 6) Si dudas del tamaño, es que es muy grande."],
];

export default function MetodoPage() {
  return (
    <div className="pt-10 space-y-10">
      <div>
        <Eyebrow>Método Invirtiendo · guía de referencia</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl leading-none">El objetivo no es acertar siempre: es que ninguna decisión dependa del ánimo del día.</h1>
      </div>

      <section>
        <h2 className="font-display text-2xl sm:text-3xl mb-3">El proceso, paso a paso</h2>
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {STEPS.map(([t, q, d], i) => (
            <li key={t} className="card p-5 flex gap-4">
              <span className="font-display text-4xl leading-none" style={{ color: "var(--olive)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="eyebrow">{q}</p>
                <p className="font-bold text-lg leading-tight">{t}</p>
                <p className="text-sm text-ink-soft mt-1">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="font-display text-2xl sm:text-3xl mb-3">Calendario del proceso</h2>
        <Card className="p-0 overflow-hidden">
          <table className="table">
            <tbody>
              {[
                ["Semanal (jueves)", "Informe MAG7 + oportunidades; decidir máximo 1-2 acciones (tramo nuevo, congelar, esperar)."],
                ["Mensual", "Actualizar el portafolio; revisar pesos vs 60/30/10; rebalancear aportes nuevos hacia lo rezagado con tesis intacta."],
                ["Trimestral (earnings)", "Releer la tesis de cada posición contra los resultados; actualizar Fair Value; congelar o reactivar acumulación."],
                ["Anual", "Auditoría completa: qué señales funcionaron, qué errores se repitieron, ajustar las reglas del proceso."],
              ].map(([k, v]) => (
                <tr key={k}>
                  <td className="font-bold whitespace-nowrap">{k}</td>
                  <td className="text-ink-soft">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="font-display text-2xl sm:text-3xl mb-3">Glosario</h2>
        <div className="space-y-4">
          {GLOSSARY.map((g) => (
            <Card key={g.group} className="p-0 overflow-hidden">
              <p className="eyebrow px-5 pt-4">{g.group}</p>
              <table className="table">
                <tbody>
                  {g.rows.map(([k, v]) => (
                    <tr key={k}>
                      <td className="font-bold whitespace-nowrap align-top w-48">{k}</td>
                      <td className="text-ink-soft">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-2xl sm:text-3xl mb-3">Cómo calcula la app</h2>
        <Card className="text-sm space-y-3 text-ink-soft">
          <p>
            <b className="text-ink">Invirtiendo Score (0-100)</b>: 70% datos objetivos (Quality 22 · Valuation 26 · Growth 16 · Risk 14 · Sentiment 12 · Balance 10) + 30% pilares cumplidos (seis, todos medidos con datos). Fair Value: modelo adelantado — EPS estimado del próximo año × P/E justo igual al crecimiento esperado recortado un 15% por prudencia y acotado entre 10x y 22x — en mediana con GuruFocus, ValueInvesting.io y el precio objetivo de los analistas, que entra un 10% por debajo.
          </p>
          <p>
            <b className="text-ink">Fair Value</b>: un solo modelo, mirando hacia adelante. La acción vale lo que ganará el próximo año fiscal (EPS de consenso) por el múltiplo que justifica su crecimiento. Ese múltiplo es el crecimiento esperado del EPS, pero <b className="text-ink">recortado un 15%</b> antes de aplicarlo y acotado entre 10x y 22x: el consenso de analistas llega sistemáticamente alto, y pagar el crecimiento completo sobre una cifra ya optimista es optimismo al cuadrado. Ese número se cruza con el Fair Value propio de GuruFocus y ValueInvesting.io y con el precio objetivo de los analistas, que entra un 10% por debajo porque es un pronóstico de precio a doce meses, no una estimación de valor. El Fair Value final es la <b className="text-ink">mediana</b> de esas fuentes, no el promedio: así ni un DCF extremo ni un objetivo eufórico mandan solos.
          </p>
          <p>
            <b className="text-ink">Seis pilares, todos automáticos</b>: negocio (gana dinero, escala, historia, crece), moat (margen bruto ≥40% estable, ROIC ≥15%), números (los 5 umbrales), dueños (recompras, SBC, retorno de capital, insiders, sorpresas), durabilidad (crecimiento sostenido, sin años caóticos) y precio (margin of safety). Ninguno pregunta nada: se asume que quien mira la acción ya entiende el negocio.
          </p>
          <p>
            <b className="text-ink">Sentimiento</b>: score por titular (−1..1) de Alpha Vantage cuando hay llave; si no, léxico financiero propio. Agregado ponderado por recencia (vida media 7 días) y relevancia. El sentimiento explica qué mueve el precio; no decide.
          </p>
        </Card>
      </section>
    </div>
  );
}
