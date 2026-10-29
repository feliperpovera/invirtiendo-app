/** Tipos compartidos entre proveedores, motor de análisis y UI. */

export type Nullable<T> = T | null;
export type N = number | null;

export type Verdict = "PASA" | "FALLA" | "DUDOSO";
export type SignalKey = "strong" | "good" | "watch" | "wait" | "avoid" | "discard";
export type SentLabel = "Bullish" | "Somewhat-Bullish" | "Neutral" | "Somewhat-Bearish" | "Bearish";
export type ProviderName = "finnhub" | "yahoo" | "sec" | "alphavantage" | "marketaux" | "polygon" | "lexicon" | "xoomar" | "tradestie" | "fx";

/* ── Complementos de APIs públicas sin llave (catálogo public-apis) ── */
/** FINRA short interest vía XOOMAR: cada reporte quincenal, el más reciente primero. */
export interface ShortInterest {
  settlementDate: string;
  shortQty: number;
  daysToCover: N;
  /** Cambio % del interés en corto frente al reporte anterior */
  changePct: N;
  /** Reportes anteriores, del más reciente al más viejo (hasta 6) */
  history: Array<{ settlementDate: string; shortQty: number; daysToCover: N }>;
}
/** Sentimiento de r/wallstreetbets vía Tradestie: solo aparece si la acción está entre las más comentadas del día. */
export interface WsbSentiment {
  sentiment: "Bullish" | "Bearish" | string;
  score: number;
  comments: number;
  /** Puesto entre las acciones más comentadas del día (1 = la más comentada) */
  rank: number;
  of: number;
}
export interface Complementos {
  shortInterest: ShortInterest | null;
  wsb: WsbSentiment | null;
  /** Pesos colombianos por dólar (tasa de referencia del día) */
  usdCop: { rate: number; date: string } | null;
}
/** Curva del Tesoro de EE. UU. vía XOOMAR (%). */
export interface YieldCurve {
  date: string;
  m3: N;
  y2: N;
  y10: N;
  y30: N;
  /** 10 años − 2 años, en puntos porcentuales. Negativo = curva invertida. */
  spread10y2y: N;
}

export interface Quote {
  symbol: string;
  name?: string;
  price: number;
  change: N;
  changePct: N;
  open: N;
  high: N;
  low: N;
  prevClose: N;
  volume: N;
  high52: N;
  low52: N;
  marketCap: N;
  currency: string;
  exchange?: string;
  quoteType?: string;
  asOf: number; // ms
  source: ProviderName;
  delayed: boolean;
}

export interface PricePoint {
  t: number; // ms
  c: number;
  /** Apertura, máximo, mínimo y volumen de la barra (vela); faltan en fuentes que solo dan cierre. */
  o?: number;
  h?: number;
  l?: number;
  v?: number;
}

export interface PriceHistory {
  symbol: string;
  daily: PricePoint[]; // ~1-2 años
  weekly: PricePoint[]; // ~5 años
  monthly: PricePoint[]; // ~10 años
  dividends?: Array<{ t: number; amount: number }>;
  splits?: Array<{ t: number; ratio: string }>;
  source: ProviderName;
}

export interface Profile {
  symbol: string;
  name: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  country?: string;
  ipo?: string;
  marketCap: N;
  sharesOutstanding: N;
  website?: string;
  logo?: string;
  description?: string;
  employees?: number | null;
  quoteType?: string;
  /** Moneda de los estados financieros (TWD para TSMC). Los valores absolutos del histórico están en esa moneda, no en dólares. */
  statementCurrency?: string;
  source: ProviderName;
}

/** Una fila anual normalizada (USD, unidades completas). */
export interface AnnualRow {
  fy: number; // año fiscal (año de la fecha de cierre)
  end: string; // YYYY-MM-DD
  revenue: N;
  grossProfit: N;
  operatingIncome: N;
  netIncome: N;
  epsDiluted: N;
  sharesDiluted: N;
  ocf: N;
  capex: N; // positivo = inversión
  fcf: N;
  totalDebt: N;
  cash: N; // efectivo + inversiones a corto plazo
  equity: N;
  totalAssets: N;
  currentAssets: N;
  currentLiabilities: N;
  interestExpense: N;
  taxExpense: N;
  pretaxIncome: N;
  rnd: N;
  sbc: N;
  buybacks: N; // positivo = recompró
  dividends: N; // positivo = pagó
  retainedEarnings: N;
}

export interface QuarterRow {
  end: string;
  revenue: N;
  netIncome: N;
  epsDiluted: N;
  fcf: N;
}

export interface Fundamentals {
  annual: AnnualRow[]; // ascendente por fy
  quarterly: QuarterRow[];
  sources: ProviderName[];
}

export interface RatioPoint {
  period: string;
  v: number;
}

export interface Metrics {
  pe: N;
  forwardPe: N;
  peg: N;
  ps: N;
  pb: N;
  evEbitda: N;
  pFcf: N;
  dividendYield: N; // %
  payoutRatio: N; // %
  beta: N;
  roe: N; // %
  roic: N; // %
  roa: N;
  grossMargin: N; // %
  operatingMargin: N;
  netMargin: N;
  revenueGrowthTTM: N; // %
  revenueGrowth5Y: N;
  epsGrowthTTM: N;
  epsGrowth5Y: N;
  debtToEquity: N; // ratio
  currentRatio: N;
  interestCoverage: N;
  epsTTM: N;
  epsForward: N; // EPS estimado próximos 12 meses (analistas)
  bvps: N;
  marketCap: N;
  enterpriseValue: N;
  netDebt: N;
  high52: N;
  low52: N;
  analystTarget: N; // precio objetivo promedio (contexto)
  shortPctFloat: N; // % del flotante en corto
  growthEstimate: N; // % crecimiento EPS estimado (analistas, próximos años)
  insidersPct: N; // % en manos de insiders
  institutionsPct: N;
  history: {
    pe: RatioPoint[];
    ps: RatioPoint[];
    pb: RatioPoint[];
    roe: RatioPoint[];
    roic: RatioPoint[];
    grossMargin: RatioPoint[];
    netMargin: RatioPoint[];
    forwardPe: RatioPoint[];
    peg: RatioPoint[];
    evEbitda: RatioPoint[];
  };
  sources: ProviderName[];
}

export interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt: number; // ms
  image?: string;
  topics: string[];
  sentiment: {
    score: number; // -1..1
    label: SentLabel;
    relevance: N;
    provider: ProviderName;
  };
}

export interface AnalystView {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
  total: number;
  consensus: string; // "Compra fuerte" | ...
  score: number; // -1..1
}

export interface InsiderView {
  mspr: N; // Finnhub monthly share purchase ratio (-100..100)
  netChange: N; // acciones netas compradas (3m)
  buys: number;
  sells: number;
  note: string;
}

export interface EarningsSurprise {
  period: string;
  actual: N;
  estimate: N;
  surprisePct: N;
}

export interface EarningsCalendar {
  nextDate: string | null;
  daysUntil: N;
  hour?: string;
  epsEstimate: N;
  revenueEstimate: N;
}

export interface PeerRow {
  symbol: string;
  name?: string;
  price: N;
  marketCap: N;
  pe: N;
  forwardPe: N;
  peg: N;
  ps: N;
  grossMargin: N;
  operatingMargin: N;
  roe: N;
  revenueGrowthTTM: N;
  isSubject?: boolean;
}

export interface SourceStatus {
  provider: ProviderName;
  ok: boolean;
  note: string;
}

/* ── Resultados del motor ───────────────────────────────────────── */

export interface CheckItem {
  key: string;
  label: string;
  value: string;
  pass: boolean | null; // null = sin dato / cualitativo
  detail?: string;
  weight?: number;
}

export interface PillarResult {
  key: string;
  title: string;
  score: N; // 0-100
  verdict: Verdict;
  summary: string;
  items: CheckItem[];
  notes: string[];
}

/** Supuestos del modelo de utilidades (Lynch): Fair Value = EPS × P/E justo */
/** Método con el que se fija el Fair Value */
export type ValuationMethod = "utilidades" | "ventas" | "libros";

export interface LynchAssumptions {
  eps: number; // EPS usado (forward de analistas o TTM)
  epsSource: "forward" | "ttm";
  growth: number; // % crecimiento esperado de utilidades
  dividendYield: number; // % (suma al P/E justo)
  qualityBonus: number; // puntos de P/E por calidad medible (ROIC, caja neta)
  fairPe: number; // P/E justo resultante, acotado
  capPe: number; // tope del P/E justo (14x en cíclicas, 25x en el resto)
}

export interface DcfAssumptions {
  discountRate: number; // %
  growthYears1to5: number; // %
  growthYears6to10: number; // % (se desvanece hacia terminal)
  terminalGrowth: number; // %
  baseFcf: number; // USD
  sharesDiluted: number;
  netCash: number; // efectivo - deuda
  sbcAdjust: boolean;
}

export interface ValuationResult extends PillarResult {
  price: number;
  intrinsic: {
    dcf: N;
    historicalPe: N;
    /** Múltiplo promedio de 5 años que el mercado le ha pagado a ESTA empresa (8-40x). */
    historicalPeMultiple: N;
    pegFair: N;
    graham: N;
    blended: N;
  };
  marginOfSafety: N; // % = (Fair Value - P)/P
  /** Modelo adelantado: EPS del próximo año × P/E justo (= crecimiento esperado recortado por prudencia, 10-22x) */
  forward: {
    epsThisYear: N;
    epsNextYear: N;
    revenueThisYear: N;
    revenueNextYear: N;
    epsGrowthThisYear: N;
    epsGrowthNextYear: N;
    revGrowthThisYear: N;
    revGrowthNextYear: N;
    growthUsed: N;
    growthSource: string;
    fairPe: N;
    modelValue: N;
    targetMean: N;
    targetHigh: N;
    targetLow: N;
    analystCount: N;
    valueTrap: boolean;
  };
  /** Estimaciones de plataformas externas que entran en la mediana */
  platforms: import("./forward").PlatformEstimate[];
  /** Qué compone la mediana del Fair Value */
  components: Array<{ fuente: string; valor: number }>;
  platformsFailed: string[];
  impliedGrowth: N; // reverse DCF %
  growthInputs: Record<string, N>;
  /** Supuestos del modelo que fija el Fair Value */
  lynch: LynchAssumptions;
  /** Método usado y por qué */
  method: ValuationMethod;
  methodReason: string;
  /** Valoración por ventas, cuando las utilidades no sirven */
  sales: { revenuePerShare: N; targetMargin: N; justifiedPs: N; value: N } | null;
  /** Valoración por valor en libros */
  book: { bvps: N; justifiedPb: N; value: N } | null;
  /** Crecimiento que el precio de hoy exige al modelo de utilidades */
  impliedGrowthEarnings: N;
  assumptions: DcfAssumptions;
  multiples: {
    pe: N;
    peAvg5y: N;
    forwardPe: N;
    peg: N;
    ps: N;
    psAvg5y: N;
    pb: N;
    evEbitda: N;
    pFcf: N;
    fcfYield: N;
    earningsYield: N;
    premiumVsHistory: N; // % (P/E actual vs promedio)
  };
  buyZone: {
    strong: N; // Fair Value × 0.80
    gradual: N; // Fair Value × 0.90
    fair: N; // Fair Value
  };
}

export interface RiskResult extends PillarResult {
  level: "Bajo" | "Medio" | "Alto" | "Especulativo";
  beta: N;
  volatility1y: N;
  maxDrawdown5y: N;
  fromHigh52: N;
  eventRisk: { nextEarnings: string | null; daysUntil: N; warn: boolean };
  cyclical: boolean;
  profile: "nucleo" | "satelite";
}

export interface SentimentResult extends PillarResult {
  news: NewsItem[];
  aggregate: { score: number; label: SentLabel; bullish: number; bearish: number; neutral: number };
  topics: Array<{ topic: string; count: number; avgScore: number }>;
  drivers: { bullish: NewsItem[]; bearish: NewsItem[] };
  analyst: AnalystView | null;
  insiders: InsiderView | null;
  earningsSurprises: EarningsSurprise[];
  provider: ProviderName;
}

export interface PeersResult extends PillarResult {
  rows: PeerRow[];
  relative: {
    peVsPeers: N; // % prima(+)/descuento(-)
    forwardPeVsPeers: N;
    pegVsPeers: N;
    marginVsPeers: N; // pp
    growthVsPeers: N; // pp
  };
  market: { name: string; forwardPe: N; pe: N };
}

export interface BuffettFilter {
  n: number;
  key: string;
  title: string;
  question: string;
  verdict: Verdict;
  auto: boolean; // calculado (true) vs cualitativo (false)
  reason: string;
  items: CheckItem[];
}

export interface BuffettResult {
  filters: BuffettFilter[];
  passed: number;
  failedCore: boolean; // fallo claro en filtros 1-5
  verdict: "BUY" | "WATCHLIST" | "DISCARD" | "REVIEW";
  verdictText: string;
}

export interface ScoreResult {
  total: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  /** Componentes: datos objetivos 55% · Lynch 25% · Buffett 20% */
  components: { data: N; lynch: N; buffett: N; weights: { data: number; lynch: number; buffett: number } };
  pillars: Array<{ key: string; title: string; score: N; weight: number }>;
  signal: { key: SignalKey; label: string; text: string };
}

export interface PlanResult {
  profile: "nucleo" | "satelite";
  maxWeightPct: number;
  tranches: Array<{ n: number; label: string; price: N; sharePct: number }>;
  thesisTemplate: { why: string; moat: string; breaker: string };
  rules: string[];
}

export interface Evaluation {
  symbol: string;
  asOf: number;
  quote: Quote;
  profile: Profile;
  history: PriceHistory;
  fundamentals: Fundamentals;
  metrics: Metrics;
  earningsCalendar: EarningsCalendar | null;
  pillars: {
    business: PillarResult;
    moat: PillarResult;
    quality: PillarResult;
    management: PillarResult;
    durability: PillarResult;
  };
  valuation: ValuationResult;
  risk: RiskResult;
  sentiment: SentimentResult;
  peers: PeersResult;
  lynch: import("./lynch").LynchResult;
  fvHistory: import("./fvhistory").FvHistory | null;
  buffett: BuffettResult;
  score: ScoreResult;
  plan: PlanResult;
  sources: SourceStatus[];
  warnings: string[];
  /** Datos de contexto de APIs públicas. Opcional: no entra al score ni al Fair Value. */
  complementos?: Complementos;
  /** Histórico de 5 años + consenso de analistas por año fiscal (tabla y gráficas "Pasado y consenso"). */
  consenso?: import("./consenso").ConsensoFila[];
}

export interface MarketPulse {
  asOf: number;
  indices: Array<{ symbol: string; name: string; price: number; changePct: N; ytdPct: N; fromHigh52: N }>;
  vix: { value: number; label: string };
  tenYear: N; // %
  curve?: YieldCurve | null;
  mood: { score: number; label: string; advice: string; components: Array<{ key: string; label: string; value: string; score: number }> };
  marketForwardPe: { spx: N; ndx: N };
}
