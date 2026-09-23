import { BullMark } from "@/components/Logo";

const STEPS = ["Cotización y precio", "10-K en SEC EDGAR", "Métricas y ratios", "Competidores", "Noticias y sentimiento", "Valor intrínseco"];

export default function Loading() {
  return (
    <div className="pt-10">
      <div className="flex items-center gap-3 mb-6">
        <BullMark size={40} className="animate-pulse" />
        <div>
          <p className="eyebrow">Leyendo datos reales</p>
          <p className="font-display text-2xl">Pasando los 7 filtros…</p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2 mb-6 text-xs text-ink-soft">
        {STEPS.map((s, i) => (
          <li key={s} className="pill border border-line" style={{ animation: `rise 400ms ${i * 120}ms both` }}>
            {s}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-3">
          <div className="skeleton h-5 w-40" />
          <div className="skeleton h-14 w-3/4" />
          <div className="skeleton h-12 w-52" />
        </div>
        <div className="skeleton h-28" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="skeleton h-48" />
        <div className="skeleton h-48" />
        <div className="skeleton h-48" />
      </div>
      <div className="space-y-3 mt-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
      <p className="text-xs text-ink-soft mt-6">La primera evaluación de un símbolo tarda 5-15 s (varias fuentes públicas). Las siguientes salen de caché.</p>
    </div>
  );
}
