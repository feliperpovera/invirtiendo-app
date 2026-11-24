"use client";

import type { ValuationResult, LynchAssumptions } from "@/lib/analysis/types";
import type { Adjusted } from "@/lib/analysis/adjust";
import { PE_MIN } from "@/lib/analysis/forward";
import { Card, Eyebrow } from "@/components/ui";
import { ordenar } from "@/lib/orden";
import { ThOrden, useOrden } from "@/components/Orden";
import { fmtMoney, fmtPct, fmtX, isNum } from "@/lib/format";

function Slider({ label, value, min, max, step, onChange, suffix = "%", hint }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string; hint?: string }) {
  return (
    <label className="block">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="num font-bold">
          {value.toFixed(step < 1 ? 2 : 0)}
          {suffix}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#c46d34] mt-1" />
      {hint && <p className="text-[0.68rem] muted">{hint}</p>}
    </label>
  );
}

function Row({ name, v, price, tag, note, bold, href }: { name: string; v: number | null; price: number; tag?: string; note: string; bold?: boolean; href?: string }) {
  const mos = isNum(v) ? ((v - price) / price) * 100 : null;
  return (
    <tr className={bold ? "bg-cream-2/60" : ""}>
      <td>
        <div className={bold ? "font-bold" : "font-medium"}>{href ? <a href={href} target="_blank" rel="noreferrer" className="hover:underline">{name}</a> : name}</div>
        <div className="text-xs text-ink-soft">{note}</div>
      </td>
      <td className={`num ${bold ? "font-display text-xl" : "font-bold"}`}>{fmtMoney(v)}</td>
      <td className="num font-semibold" style={{ color: isNum(mos) ? (mos >= 15 ? "var(--sig-strong)" : mos >= -10 ? "var(--sig-watch)" : "var(--sig-avoid)") : undefined }}>
        {fmtPct(mos, 0, true)}
      </td>
      <td className="text-xs text-ink-soft whitespace-nowrap">{tag ?? ""}</td>
    </tr>
  );
}

const cumple = (pass: boolean | null) => (pass === true ? { t: "Cumple", c: "var(--sig-strong)" } : pass === false ? { t: "No cumple", c: "var(--sig-avoid)" } : { t: "Sin dato", c: "var(--ink-soft)" });

export function ValuationPanel({ v, adjusted, assump, setAssump }: { v: ValuationResult; adjusted: Adjusted; assump: LynchAssumptions; setAssump: (a: LynchAssumptions) => void }) {
  const set = (patch: Partial<LynchAssumptions>) => setAssump({ ...assump, ...patch });
  const m = v.multiples;
  const f = v.forward;
  const changed = JSON.stringify(assump) !== JSON.stringify(v.lynch);
  const multiples: Array<[string, string]> = [
    ["P/E", fmtX(m.pe)],
    ["Fwd P/E", fmtX(m.forwardPe)],
    ["PEG fwd", isNum(m.peg) && m.peg > 0 && m.peg < 10 ? m.peg.toFixed(2) : "n.s."],
    ["P/S", fmtX(m.ps)],
    ["P/FCF", fmtX(m.pFcf)],
  ];
  const ctl = useOrden<"nombre" | "valor" | "vs" | "tipo">("tipo", false, ["nombre", "tipo"]);
  const modelos = v.platforms.filter((p) => p.tipo === "modelo");
  const objetivos = v.platforms.filter((p) => p.tipo === "objetivo");

  // "Fair Value" queda fijo arriba; se ordenan las fuentes (por tipo: modelo, plataforma, objetivo)
  const TIPOS: Record<string, number> = { modelo: 0, plataforma: 1, objetivo: 2 };
  const fuentes = ordenar(
    [
      { name: "Modelo adelantado", v: adjusted.modelo, tag: "modelo", href: undefined as string | undefined, note: assump.eps > 0 ? `EPS próximo año ${fmtMoney(assump.eps)} × P/E justo ${adjusted.fairPe.toFixed(1)}x (crecimiento ${fmtPct(assump.growth, 0)} recortado por prudencia, entre ${PE_MIN}x y ${assump.capPe}x)` : "Sin EPS estimado positivo para el próximo año" },
      ...modelos.map((p) => ({ name: p.fuente, v: p.valor, tag: "plataforma", href: p.url || undefined, note: "Fair Value propio de la plataforma" })),
      ...objetivos.map((p) => ({ name: p.fuente, v: p.valor, tag: "objetivo", href: p.url || undefined, note: "Precio objetivo promedio a 12 meses; cuenta una sola vez en la mediana" })),
    ],
    (f) => (ctl.o.k === "nombre" ? f.name : ctl.o.k === "tipo" ? TIPOS[f.tag] : f.v),
    ctl.o.desc,
  );

  return (
    <section>
      <Eyebrow className="mb-2">Fair Value · un solo método</Eyebrow>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-3">
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <ThOrden ctl={ctl} k="nombre">Fuente</ThOrden>
                  <ThOrden ctl={ctl} k="valor" className="num">Valor</ThOrden>
                  <ThOrden ctl={ctl} k="vs" className="num">vs precio</ThOrden>
                  <ThOrden ctl={ctl} k="tipo">Tipo</ThOrden>
                </tr>
              </thead>
              <tbody>
                <Row name="Fair Value" v={adjusted.blended} price={v.price} tag="mediana" note={`Mediana de ${v.components.length} fuentes: ni la más optimista ni la más pesimista manda`} bold />
                {fuentes.map((f) => <Row key={f.name} {...f} price={v.price} />)}
                {v.platformsFailed.length > 0 && (
                  <tr>
                    <td colSpan={4} className="text-xs text-ink-soft py-2">
                      Sin respuesta de {v.platformsFailed.join(", ")} en esta consulta. Morningstar, Investing.com, Simply Wall St y Alpha Spread no publican su Fair Value sin suscripción.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            {[
              { l: "Strong Buy", v: adjusted.buyZone.strong, s: "−25%", bg: "var(--sig-strong)", fg: "var(--cream)" },
              { l: "Buy Zone", v: adjusted.buyZone.gradual, s: "−15%", bg: "var(--sig-good)", fg: "var(--cream)" },
              { l: "Fair Value", v: adjusted.buyZone.fair, s: "observar", bg: "var(--sig-watch)", fg: "var(--ink)" },
            ].map((z) => (
              <div key={z.l} className="rounded-2xl p-3" style={{ background: z.bg, color: z.fg }}>
                <p className="text-[0.65rem] uppercase tracking-wider font-bold opacity-90">{z.l}</p>
                <p className="num font-display text-xl leading-tight">{fmtMoney(z.v)}</p>
                <p className="text-[0.68rem] opacity-90">{z.s}</p>
              </div>
            ))}
          </div>

          <ul className="mt-4 space-y-1.5">
            {v.items.map((it) => {
              const c = cumple(it.pass);
              return (
                <li key={it.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-sm">
                  <span title={it.detail}>{it.label}</span>
                  <span className="num font-semibold">{it.value}</span>
                  <span className="text-xs font-bold uppercase tracking-wider w-20 text-right" style={{ color: c.c }}>
                    {c.t}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 grid grid-cols-5 gap-2">
            {multiples.map(([k, val]) => (
              <div key={k}>
                <p className="text-[0.62rem] uppercase tracking-wider font-bold text-ink-soft">{k}</p>
                <p className="num font-bold">{val}</p>
              </div>
            ))}
          </div>

          {v.notes.map((n) => (
            <p key={n} className="text-xs text-ink-soft mt-3">
              {n}
            </p>
          ))}
        </Card>

        <Card ink className="lg:col-span-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Eyebrow>Los 2 supuestos del modelo</Eyebrow>
              <p className="text-sm muted">Fair Value del modelo = EPS del próximo año × crecimiento esperado (como P/E). Lo demás es consenso.</p>
            </div>
            {changed && (
              <button type="button" className="btn btn-ghost text-cream border-[#4a4740] py-1 px-3 text-xs" onClick={() => setAssump(v.lynch)}>
                Restablecer
              </button>
            )}
          </div>

          <div className="space-y-4 mt-4">
            <Slider
              label="EPS estimado próximo año"
              value={assump.eps}
              min={0}
              max={Math.max(5, Math.ceil((v.lynch.eps || 1) * 2))}
              step={0.05}
              suffix=""
              onChange={(x) => set({ eps: x })}
              hint={isNum(f.epsThisYear) ? `Consenso: este año ${fmtMoney(f.epsThisYear)} · próximo ${fmtMoney(f.epsNextYear)}` : "Consenso de analistas para el próximo año fiscal"}
            />
            <Slider
              label="Crecimiento esperado del EPS"
              value={assump.growth}
              min={-20}
              max={80}
              step={0.5}
              onChange={(x) => set({ growth: x })}
              hint={`Regla del método: el P/E justo es el crecimiento recortado por prudencia, entre ${PE_MIN}x y ${assump.capPe}x. Fuente: ${f.growthSource}.`}
            />
            <Slider label="Tope del P/E justo" value={assump.capPe} min={12} max={35} step={1} suffix="x" onChange={(x) => set({ capPe: x })} hint="22x por defecto: ni Nvidia con 60% de crecimiento merece pagar más de eso por adelantado." />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-[#2f2d27] p-3">
              <p className="text-[0.65rem] uppercase tracking-wider font-bold muted">P/E justo</p>
              <p className="num font-display text-2xl">{adjusted.fairPe.toFixed(1)}x</p>
              <p className="text-xs muted">crecimiento {assump.growth.toFixed(0)}% acotado</p>
            </div>
            <div className="rounded-xl bg-[#2f2d27] p-3">
              <p className="text-[0.65rem] uppercase tracking-wider font-bold muted">Fwd P/E que paga el mercado</p>
              <p className="num font-display text-2xl">{isNum(adjusted.implied) ? `${adjusted.implied.toFixed(1)}x` : "—"}</p>
              <p className="text-xs muted">precio ÷ EPS próximo año</p>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
