/**
 * SEC EDGAR — XBRL "Company Facts". Gratis, sin llave, sin límite práctico
 * (10 req/s). Da 10-16 años de estados financieros auditados (10-K) para
 * empresas que reportan en US-GAAP. Exige un User-Agent con nombre y email.
 */
import { fetchJson, env } from "./http";
import { cached, TTL } from "./cache";
import type { AnnualRow, QuarterRow } from "@/lib/analysis/types";
import { isNum } from "@/lib/format";

const H = () => ({ "User-Agent": env.secUA(), Accept: "application/json", "Accept-Encoding": "gzip, deflate" });

interface TickerMap {
  [k: string]: { cik_str: number; ticker: string; title: string };
}

export async function secCik(symbol: string): Promise<{ cik: string; title: string } | null> {
  const map = await cached("sec:tickers", TTL.sec, async () => {
    const d = await fetchJson<TickerMap>("sec", "https://www.sec.gov/files/company_tickers.json", { headers: H() });
    const out: Record<string, { cik: string; title: string }> = {};
    for (const v of Object.values(d)) {
      out[v.ticker.toUpperCase()] = { cik: String(v.cik_str).padStart(10, "0"), title: v.title };
    }
    return out;
  });
  const key = symbol.toUpperCase().replace(".", "-");
  return map[key] ?? map[symbol.toUpperCase()] ?? null;
}

interface Fact {
  start?: string;
  end: string;
  val: number;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
}
interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: Record<string, { units: Record<string, Fact[]> }>;
    dei?: Record<string, { units: Record<string, Fact[]> }>;
  };
}

/** Preferencia de etiquetas XBRL por concepto (la primera que exista gana por año). */
const TAGS: Record<keyof Omit<AnnualRow, "fy" | "end">, { tags: string[]; instant?: boolean; sum?: boolean }> = {
  revenue: { tags: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet", "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueGoodsNet"] },
  grossProfit: { tags: ["GrossProfit"] },
  operatingIncome: { tags: ["OperatingIncomeLoss"] },
  netIncome: { tags: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"] },
  epsDiluted: { tags: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"] },
  sharesDiluted: { tags: ["WeightedAverageNumberOfDilutedSharesOutstanding", "WeightedAverageNumberOfShareOutstandingBasicAndDiluted"] },
  ocf: { tags: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"] },
  capex: { tags: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets", "PaymentsForCapitalImprovements"] },
  fcf: { tags: [] },
  totalDebt: { tags: ["LongTermDebt", "DebtAndCapitalLeaseObligations", "LongTermDebtAndCapitalLeaseObligations"], instant: true },
  cash: { tags: ["CashCashEquivalentsAndShortTermInvestments", "CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"], instant: true },
  equity: { tags: ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"], instant: true },
  totalAssets: { tags: ["Assets"], instant: true },
  currentAssets: { tags: ["AssetsCurrent"], instant: true },
  currentLiabilities: { tags: ["LiabilitiesCurrent"], instant: true },
  interestExpense: { tags: ["InterestExpense", "InterestExpenseNonoperating", "InterestExpenseDebt", "InterestAndDebtExpense"] },
  taxExpense: { tags: ["IncomeTaxExpenseBenefit"] },
  pretaxIncome: { tags: ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments"] },
  rnd: { tags: ["ResearchAndDevelopmentExpense", "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost"] },
  sbc: { tags: ["ShareBasedCompensation", "AllocatedShareBasedCompensationExpense"] },
  buybacks: { tags: ["PaymentsForRepurchaseOfCommonStock"] },
  dividends: { tags: ["PaymentsOfDividendsCommonStock", "PaymentsOfDividends", "PaymentsOfOrdinaryDividends"] },
  retainedEarnings: { tags: ["RetainedEarningsAccumulatedDeficit"], instant: true },
};

/** Deuda: si no hay etiqueta consolidada, sumar componentes. */
const DEBT_COMPONENTS = ["LongTermDebtNoncurrent", "LongTermDebtCurrent", "ShortTermBorrowings", "CommercialPaper", "DebtCurrent", "LongTermDebtAndCapitalLeaseObligationsCurrent"];
const CASH_EXTRA = ["ShortTermInvestments", "MarketableSecuritiesCurrent", "AvailableForSaleSecuritiesDebtSecuritiesCurrent"];

const days = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000;

/** Devuelve {end → val} usando solo 10-K anuales, el filing más reciente por fecha de cierre. */
function annualSeries(gaap: NonNullable<CompanyFacts["facts"]["us-gaap"]>, tag: string, instant: boolean): Map<string, number> {
  const out = new Map<string, { val: number; filed: string }>();
  const concept = gaap[tag];
  if (!concept) return new Map();
  const unitKey = Object.keys(concept.units)[0];
  for (const f of concept.units[unitKey] ?? []) {
    if (!/^10-K/.test(f.form) && !/^20-F/.test(f.form) && !/^40-F/.test(f.form)) continue;
    if (f.fp !== "FY") continue;
    if (!instant) {
      if (!f.start) continue;
      const d = days(f.start, f.end);
      if (d < 340 || d > 380) continue;
    }
    const prev = out.get(f.end);
    if (!prev || f.filed > prev.filed) out.set(f.end, { val: f.val, filed: f.filed });
  }
  return new Map([...out.entries()].map(([k, v]) => [k, v.val]));
}

export async function secAnnualHistory(symbol: string): Promise<{ rows: AnnualRow[]; entity: string } | null> {
  const id = await secCik(symbol).catch(() => null);
  if (!id) return null;
  return cached(`sec:facts:${id.cik}`, TTL.sec, async () => {
    const d = await fetchJson<CompanyFacts>("sec", `https://data.sec.gov/api/xbrl/companyfacts/CIK${id.cik}.json`, { headers: H(), timeoutMs: 20000 });
    const gaap = d.facts["us-gaap"];
    if (!gaap) return { rows: [], entity: d.entityName };

    // Fechas de cierre fiscal: las de NetIncome (o Revenue) en 10-K
    const anchor = new Map<string, number>();
    for (const t of ["NetIncomeLoss", "ProfitLoss", "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"]) {
      for (const [end, v] of annualSeries(gaap, t, false)) if (!anchor.has(end)) anchor.set(end, v);
    }
    const ends = [...anchor.keys()].sort();
    if (!ends.length) return { rows: [], entity: d.entityName };

    // Series por concepto (mezcla de etiquetas: la primera con dato por año gana)
    const seriesFor = (tags: string[], instant: boolean) => {
      const merged = new Map<string, number>();
      for (const t of tags) {
        for (const [end, v] of annualSeries(gaap, t, instant)) if (!merged.has(end)) merged.set(end, v);
      }
      return merged;
    };
    const S: Record<string, Map<string, number>> = {};
    for (const [field, cfg] of Object.entries(TAGS)) S[field] = seriesFor(cfg.tags, !!cfg.instant);
    const debtParts = DEBT_COMPONENTS.map((t) => annualSeries(gaap, t, true));
    const cashExtra = CASH_EXTRA.map((t) => annualSeries(gaap, t, true));
    const cashPlain = annualSeries(gaap, "CashAndCashEquivalentsAtCarryingValue", true);
    const cashCombined = annualSeries(gaap, "CashCashEquivalentsAndShortTermInvestments", true);

    // Los instantes (balance) pueden tener 'end' igual al cierre fiscal: buscar el más cercano (±10 días)
    const nearest = (m: Map<string, number>, end: string): number | null => {
      if (m.has(end)) return m.get(end)!;
      let best: { d: number; v: number } | null = null;
      for (const [k, v] of m) {
        const dd = Math.abs(days(k, end));
        if (dd <= 10 && (!best || dd < best.d)) best = { d: dd, v };
      }
      return best ? best.v : null;
    };

    const rows: AnnualRow[] = ends.map((end) => {
      const g = (f: string) => nearest(S[f], end);
      let totalDebt = g("totalDebt");
      if (!isNum(totalDebt)) {
        const parts = debtParts.map((m) => nearest(m, end)).filter(isNum);
        totalDebt = parts.length ? parts.reduce((a, b) => a + b, 0) : null;
      }
      let cash = nearest(cashCombined, end);
      if (!isNum(cash)) {
        const base = nearest(cashPlain, end);
        const extra = cashExtra.map((m) => nearest(m, end)).find(isNum);
        cash = isNum(base) ? base + (isNum(extra) ? extra : 0) : null;
      }
      const ocf = g("ocf");
      const capex = g("capex");
      return {
        fy: Number(end.slice(0, 4)),
        end,
        revenue: g("revenue"),
        grossProfit: g("grossProfit"),
        operatingIncome: g("operatingIncome"),
        netIncome: g("netIncome"),
        epsDiluted: g("epsDiluted"),
        sharesDiluted: g("sharesDiluted"),
        ocf,
        capex,
        fcf: isNum(ocf) && isNum(capex) ? ocf - capex : null,
        totalDebt,
        cash,
        equity: g("equity"),
        totalAssets: g("totalAssets"),
        currentAssets: g("currentAssets"),
        currentLiabilities: g("currentLiabilities"),
        interestExpense: g("interestExpense"),
        taxExpense: g("taxExpense"),
        pretaxIncome: g("pretaxIncome"),
        rnd: g("rnd"),
        sbc: g("sbc"),
        buybacks: g("buybacks"),
        dividends: g("dividends"),
        retainedEarnings: g("retainedEarnings"),
      };
    });
    // Margen bruto faltante: revenue - costo
    const cost = seriesFor(["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"], false);
    for (const r of rows) {
      if (!isNum(r.grossProfit) && isNum(r.revenue)) {
        const c = nearest(cost, r.end);
        if (isNum(c)) r.grossProfit = r.revenue - c;
      }
    }
    return { rows: rows.filter((r) => isNum(r.revenue) || isNum(r.netIncome)), entity: d.entityName };
  });
}

/* ── Histórico trimestral (10-Q + 10-K) para el gráfico de Fair Value ── */
export async function secQuarterly(symbol: string): Promise<QuarterRow[]> {
  const id = await secCik(symbol).catch(() => null);
  if (!id) return [];
  return cached(`sec:q:${id.cik}`, TTL.sec, async () => {
    const d = await fetchJson<CompanyFacts>("sec", `https://data.sec.gov/api/xbrl/companyfacts/CIK${id.cik}.json`, { headers: H(), timeoutMs: 20000 });
    const gaap = d.facts["us-gaap"];
    if (!gaap) return [];
    /** Periodos de ~1 trimestre (80-100 días), el filing más reciente gana */
    const q = (tags: string[]) => {
      const out = new Map<string, { val: number; filed: string }>();
      for (const t of tags) {
        const c = gaap[t];
        if (!c) continue;
        const unit = Object.keys(c.units)[0];
        for (const f of c.units[unit] ?? []) {
          if (!f.start || !/^10-[KQ]|^20-F|^40-F/.test(f.form)) continue;
          const dd = days(f.start, f.end);
          if (dd < 80 || dd > 100) continue;
          const prev = out.get(f.end);
          if (!prev || f.filed > prev.filed) out.set(f.end, { val: f.val, filed: f.filed });
        }
      }
      return new Map([...out].map(([k, v]) => [k, v.val]));
    };
    const eps = q(["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"]);
    const rev = q(["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues", "SalesRevenueNet"]);
    const ni = q(["NetIncomeLoss", "ProfitLoss"]);
    const ocf = q(["NetCashProvidedByUsedInOperatingActivities"]);
    const capex = q(["PaymentsToAcquirePropertyPlantAndEquipment"]);
    const ends = [...new Set([...eps.keys(), ...ni.keys()])].sort();
    return ends.map((end) => {
      const o = ocf.get(end);
      const c = capex.get(end);
      return {
        end,
        revenue: rev.get(end) ?? null,
        netIncome: ni.get(end) ?? null,
        epsDiluted: eps.get(end) ?? null,
        fcf: isNum(o) && isNum(c) ? o - c : null,
      };
    });
  });
}
