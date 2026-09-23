import type { PeerRow, PeersResult, CheckItem, N } from "./types";
import { isNum, median, fmtX, fmtPct } from "@/lib/format";

/** Competidores de respaldo cuando no hay Finnhub (peers gratis) o el sector no está cubierto. */
const STATIC: Record<string, string[]> = {
  AAPL: ["MSFT", "GOOGL", "DELL", "HPQ"], MSFT: ["GOOGL", "ORCL", "CRM", "NOW", "AMZN"], GOOGL: ["META", "MSFT", "AMZN", "NFLX"], GOOG: ["META", "MSFT", "AMZN", "NFLX"],
  AMZN: ["WMT", "MSFT", "GOOGL", "COST"], META: ["GOOGL", "SNAP", "PINS", "NFLX"], NVDA: ["AMD", "AVGO", "TSM", "QCOM", "INTC"], TSLA: ["GM", "F", "RIVN", "TM"],
  AMD: ["NVDA", "INTC", "AVGO", "QCOM"], AVGO: ["NVDA", "QCOM", "MRVL", "TXN"], TSM: ["INTC", "NVDA", "ASML", "AMD"], ASML: ["AMAT", "LRCX", "KLAC", "TSM"],
  MU: ["WDC", "SNDK", "STX", "INTC"], SNDK: ["MU", "WDC", "STX"], WDC: ["STX", "MU", "SNDK"], STX: ["WDC", "MU", "SNDK"], INTC: ["AMD", "NVDA", "QCOM", "TXN"], QCOM: ["AVGO", "AMD", "NVDA", "TXN"],
  ARM: ["NVDA", "QCOM", "AMD", "INTC"], MRVL: ["AVGO", "NVDA", "AMD"], TXN: ["ADI", "NXPI", "MCHP", "ON"], AMAT: ["LRCX", "KLAC", "ASML"], LRCX: ["AMAT", "KLAC", "ASML"], KLAC: ["AMAT", "LRCX", "ASML"],
  NFLX: ["DIS", "WBD", "PARA", "ROKU"], DIS: ["NFLX", "WBD", "CMCSA"], CMCSA: ["CHTR", "DIS", "T", "VZ"], SPOT: ["NFLX", "WBD", "SIRI"],
  PYPL: ["V", "MA", "XYZ", "AFRM"], V: ["MA", "AXP", "PYPL"], MA: ["V", "AXP", "PYPL"], AXP: ["V", "MA", "COF"], JPM: ["BAC", "WFC", "C", "GS"], BAC: ["JPM", "WFC", "C"], GS: ["MS", "JPM", "C"],
  "BRK.B": ["JPM", "MKL", "PGR"], "BRK-B": ["JPM", "MKL", "PGR"], COST: ["WMT", "TGT", "BJ", "AMZN"], WMT: ["COST", "TGT", "AMZN", "KR"], TGT: ["WMT", "COST", "DG"],
  UNH: ["ELV", "CI", "HUM", "CVS"], LLY: ["NVO", "MRK", "PFE", "ABBV"], NVO: ["LLY", "MRK", "PFE"], ABBV: ["MRK", "PFE", "BMY", "LLY"], MRK: ["PFE", "LLY", "ABBV", "BMY"], PFE: ["MRK", "BMY", "ABBV"],
  XOM: ["CVX", "COP", "SHEL"], CVX: ["XOM", "COP", "SHEL"], CRM: ["NOW", "ORCL", "MSFT", "ADBE"], ORCL: ["MSFT", "SAP", "IBM", "CRM"], ADBE: ["CRM", "INTU", "MSFT", "NOW"], NOW: ["CRM", "WDAY", "ORCL"], INTU: ["ADBE", "CRM", "HRB"],
  PLTR: ["SNOW", "CRWD", "NOW", "DDOG"], SNOW: ["DDOG", "MDB", "PLTR"], CRWD: ["PANW", "ZS", "FTNT", "S"], PANW: ["CRWD", "FTNT", "ZS"], ZS: ["CRWD", "PANW", "FTNT"], DDOG: ["SNOW", "MDB", "NET"],
  UBER: ["LYFT", "DASH", "ABNB"], ABNB: ["BKNG", "EXPE", "MAR"], BKNG: ["ABNB", "EXPE", "MAR"], SHOP: ["AMZN", "WIX", "ETSY"], NBIS: ["CRWV", "IREN", "APLD", "ORCL"], CRWV: ["NBIS", "IREN", "ORCL"], IREN: ["CRWV", "NBIS", "APLD"],
  SMCI: ["DELL", "HPE", "NVDA"], DELL: ["HPQ", "HPE", "SMCI"], KO: ["PEP", "KDP", "MNST"], PEP: ["KO", "KDP", "MDLZ"], MCD: ["YUM", "CMG", "QSR", "SBUX"], SBUX: ["MCD", "CMG", "YUM"], CMG: ["MCD", "SBUX", "YUM"],
  NKE: ["LULU", "DECK", "ONON"], LULU: ["NKE", "DECK", "ONON"], HD: ["LOW", "FND", "TGT"], LOW: ["HD", "FND"], BA: ["LMT", "RTX", "GD", "NOC"], LMT: ["RTX", "GD", "NOC", "BA"], RTX: ["LMT", "GD", "NOC"], GE: ["RTX", "HON", "MMM"],
  CAT: ["DE", "CMI", "PCAR"], DE: ["CAT", "AGCO", "CNH"], IBM: ["ORCL", "ACN", "MSFT"], ACN: ["IBM", "CTSH", "EPAM"], HON: ["GE", "MMM", "EMR"], MMM: ["HON", "GE", "EMR"],
  ISRG: ["MDT", "SYK", "BSX"], ABT: ["MDT", "SYK", "BSX"], TMO: ["DHR", "A", "ILMN"], AMGN: ["GILD", "REGN", "VRTX"], GILD: ["AMGN", "REGN", "BMY"], REGN: ["VRTX", "AMGN", "BIIB"],
  T: ["VZ", "TMUS", "CMCSA"], VZ: ["T", "TMUS", "CMCSA"], TMUS: ["VZ", "T", "CHTR"], NEE: ["DUK", "SO", "D"], SCHW: ["MS", "GS", "IBKR"], BLK: ["BX", "KKR", "APO"], SPGI: ["MCO", "MSCI", "ICE"],
  ANET: ["CSCO", "JNPR", "NVDA"], CSCO: ["ANET", "JNPR", "HPE"], ADI: ["TXN", "NXPI", "MCHP"], ON: ["TXN", "ADI", "NXPI"], MCHP: ["TXN", "ADI", "NXPI"], MDB: ["SNOW", "DDOG", "ORCL"], NET: ["DDOG", "ZS", "AKAM"], RBLX: ["EA", "TTWO", "U"], EA: ["TTWO", "RBLX", "SONY"], TTWO: ["EA", "RBLX"],
  COIN: ["HOOD", "SCHW", "IBKR"], HOOD: ["COIN", "SCHW", "IBKR"], MSTR: ["COIN", "HOOD"], SOFI: ["HOOD", "AFRM", "UPST"], AFRM: ["PYPL", "SOFI", "UPST"], XYZ: ["PYPL", "AFRM", "TOST"],
  RIVN: ["TSLA", "LCID", "F"], F: ["GM", "TSLA", "TM"], GM: ["F", "TSLA", "TM"], TM: ["HMC", "F", "GM"], HMC: ["TM", "F", "GM"],
  DASH: ["UBER", "LYFT", "CART"], LYFT: ["UBER", "DASH"], ETSY: ["EBAY", "SHOP", "AMZN"], EBAY: ["ETSY", "AMZN", "SHOP"], W: ["ETSY", "AMZN", "RH"], CHWY: ["AMZN", "PETQ", "WOOF"],
  ADP: ["PAYX", "PYCR", "WDAY"], PAYX: ["ADP", "PYCR"], WDAY: ["NOW", "CRM", "ADP"], VRTX: ["REGN", "AMGN", "GILD"], BSX: ["MDT", "SYK", "ABT"], SYK: ["BSX", "MDT", "ZBH"], MDT: ["BSX", "SYK", "ABT"],
};

export function staticPeers(symbol: string): string[] {
  return STATIC[symbol.toUpperCase()] ?? [];
}

const relPct = (a: N, b: N): N => (isNum(a) && isNum(b) && b > 0 && a > 0 ? (a / b - 1) * 100 : null);
const relPp = (a: N, b: N): N => (isNum(a) && isNum(b) ? a - b : null);

export function peersPillar(subject: PeerRow, peers: PeerRow[], market: { name: string; forwardPe: N; pe: N }): PeersResult {
  const valid = peers.filter((p) => p.symbol !== subject.symbol);
  const med = (f: (p: PeerRow) => N) => median(valid.map(f));
  const relative = {
    peVsPeers: relPct(subject.pe, med((p) => p.pe)),
    forwardPeVsPeers: relPct(subject.forwardPe, med((p) => p.forwardPe)),
    pegVsPeers: relPct(subject.peg, med((p) => p.peg)),
    marginVsPeers: relPp(subject.operatingMargin, med((p) => p.operatingMargin)),
    growthVsPeers: relPp(subject.revenueGrowthTTM, med((p) => p.revenueGrowthTTM)),
  };
  const items: CheckItem[] = [
    { key: "fwd", label: "Forward P/E vs mediana de pares", value: `${fmtX(subject.forwardPe)} vs ${fmtX(med((p) => p.forwardPe))} (${fmtPct(relative.forwardPeVsPeers, 0, true)})`, pass: isNum(relative.forwardPeVsPeers) ? relative.forwardPeVsPeers <= 10 : null, detail: "Prima justificada solo si crece o gana más que los pares" },
    { key: "peg", label: "PEG vs pares", value: `${isNum(subject.peg) ? subject.peg.toFixed(2) : "—"} vs ${isNum(med((p) => p.peg)) ? med((p) => p.peg)!.toFixed(2) : "—"}`, pass: isNum(relative.pegVsPeers) ? relative.pegVsPeers <= 0 : null },
    { key: "margin", label: "Margen operativo vs pares", value: `${fmtPct(subject.operatingMargin, 1)} vs ${fmtPct(med((p) => p.operatingMargin), 1)} (${isNum(relative.marginVsPeers) ? (relative.marginVsPeers > 0 ? "+" : "") + relative.marginVsPeers.toFixed(1) + " pp" : "—"})`, pass: isNum(relative.marginVsPeers) ? relative.marginVsPeers >= 0 : null, detail: "Margen superior sostenido = evidencia de moat frente a la competencia" },
    { key: "growth", label: "Crecimiento de ingresos vs pares", value: `${fmtPct(subject.revenueGrowthTTM, 1)} vs ${fmtPct(med((p) => p.revenueGrowthTTM), 1)}`, pass: isNum(relative.growthVsPeers) ? relative.growthVsPeers >= 0 : null, detail: "¿Está ganando o perdiendo cuota?" },
    { key: "mkt", label: `Forward P/E vs ${market.name}`, value: `${fmtX(subject.forwardPe)} vs ${fmtX(market.forwardPe)}`, pass: isNum(subject.forwardPe) && isNum(market.forwardPe) ? subject.forwardPe <= market.forwardPe * 1.15 || (isNum(relative.growthVsPeers) && relative.growthVsPeers > 5) : null, detail: "Comprar barato en un mercado caro exige más disciplina" },
  ];
  const known = items.filter((i) => i.pass !== null);
  const score = known.length ? Math.round((known.filter((i) => i.pass).length / known.length) * 100) : null;
  const cheaper = isNum(relative.forwardPeVsPeers) && relative.forwardPeVsPeers < 0;
  const better = (isNum(relative.marginVsPeers) && relative.marginVsPeers > 0) || (isNum(relative.growthVsPeers) && relative.growthVsPeers > 0);
  const verdict = !known.length ? "DUDOSO" : cheaper && better ? "PASA" : !cheaper && !better ? "FALLA" : "DUDOSO";
  let summary = "Sin suficientes pares con datos para comparar.";
  if (known.length) {
    summary = cheaper && better
      ? "Más barata que sus pares y con mejor negocio: anomalía aprovechable si no hay deterioro."
      : cheaper && !better
        ? "Más barata que sus pares pero con peores márgenes o crecimiento: el descuento puede estar justificado (¿value trap?)."
        : !cheaper && better
          ? "Cotiza con prima frente a pares, respaldada por mejor calidad o crecimiento."
          : "Más cara que sus pares sin mejores números: la prima es difícil de justificar.";
  }
  return {
    key: "peers",
    title: "Peers",
    score,
    verdict,
    summary,
    items,
    notes: ["Múltiplos más bajos que pares + PEG < 1 + descuento vs su historia sin deterioro = señal fuerte de infravaloración."],
    rows: [{ ...subject, isSubject: true }, ...valid],
    relative,
    market,
  };
}
