import Link from "next/link";
import type { RankingRow } from "@/lib/providers/ranking";
import type { SignalKey } from "@/lib/analysis/types";
import { Card, SignalPill } from "./ui";
import { fmtBig, fmtMoney, fmtPct, isNum } from "@/lib/format";

const colorMos = (mos: number | null) => (isNum(mos) ? (mos >= 15 ? "var(--sig-strong)" : mos >= -10 ? "var(--sig-watch)" : "var(--sig-avoid)") : undefined);

/** Ranking completo por Invirtiendo Score: los 5 primeros en tarjetas, todos en la tabla. */
export function Ranking({ filas }: { filas: RankingRow[] }) {
  if (!filas.length) return <p className="text-sm text-ink-soft">Todavía no hay acciones evaluadas.</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {filas.slice(0, 5).map((r, i) => (
          <Link key={r.ticker} href={`/accion/${r.ticker}`} className="card p-4 hover:border-terracotta transition-colors">
            <div className="flex items-start justify-between gap-2">
              <span className="font-display text-3xl leading-none text-terracotta">{i + 1}</span>
              {r.senal_key && r.senal && <SignalPill k={r.senal_key as SignalKey} label={r.senal} />}
            </div>
            <p className="font-bold text-lg mt-3 leading-tight">{r.ticker}</p>
            <p className="text-xs text-ink-soft truncate">{r.nombre ?? ""}</p>
            <p className="mt-3">
              <span className="font-display text-3xl leading-none">{r.score}</span>
              <span className="text-xs text-ink-soft ml-1">{r.grade}</span>
            </p>
            <p className="text-xs num mt-2">
              {fmtMoney(r.precio)} · FV {fmtMoney(r.fair_value)}
            </p>
            <p className="text-xs num text-ink-soft">Cap. {fmtBig(r.market_cap)}</p>
            <p className="text-xs num" style={{ color: colorMos(r.mos) }}>
              {fmtPct(r.mos, 0, true)} margen
            </p>
          </Link>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="scroll-x">
          <table className="table min-w-[820px]">
            <thead>
              <tr>
                <th>#</th>
                <th>Acción</th>
                <th>Sector</th>
                <th className="num">Score</th>
                <th>Señal</th>
                <th className="num">Precio</th>
                <th className="num">Cap. mercado</th>
                <th className="num">Fair Value</th>
                <th className="num">Margen</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((r, i) => (
                <tr key={r.ticker}>
                  <td className="num font-display text-xl text-ink-soft w-10">{i + 1}</td>
                  <td>
                    <Link href={`/accion/${r.ticker}`} className="font-bold hover:text-terracotta">
                      {r.ticker}
                    </Link>
                    <div className="text-xs text-ink-soft truncate max-w-[14rem]">{r.nombre ?? ""}</div>
                  </td>
                  <td className="text-xs text-ink-soft whitespace-nowrap">{r.sector ?? "—"}</td>
                  <td className="num">
                    <span className="font-display text-2xl leading-none">{r.score}</span>
                    <span className="text-xs text-ink-soft ml-1">{r.grade}</span>
                  </td>
                  <td>{r.senal_key && r.senal ? <SignalPill k={r.senal_key as SignalKey} label={r.senal} /> : "—"}</td>
                  <td className="num">{fmtMoney(r.precio)}</td>
                  <td className="num">{fmtBig(r.market_cap)}</td>
                  <td className="num">{fmtMoney(r.fair_value)}</td>
                  <td className="num" style={{ color: colorMos(r.mos) }}>
                    {fmtPct(r.mos, 0, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
