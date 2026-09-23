/**
 * Auditoría del modelo de Fair Value: recorre tickers y marca anomalías.
 * node scripts/audit.mjs [base] [TICKERS,...]
 */
const base = process.argv[2] ?? "http://localhost:3000";
const list = (process.argv[3] ??
  "AAPL,MSFT,GOOGL,AMZN,META,NVDA,TSLA,AVGO,TSM,AMD,ASML,MU,ARM,QCOM,INTC,TXN,ANET,SMCI,PLTR,CRWD,PANW,SNOW,NOW,CRM,ORCL,ADBE,INTU,IBM,ACN,COST,WMT,TGT,HD,LOW,MCD,SBUX,NKE,KO,PEP,PG,V,MA,AXP,PYPL,JPM,BAC,BRK-B,GS,SCHW,UNH,LLY,ABBV,MRK,PFE,ISRG,TMO,ABT,XOM,CVX,CAT,DE,BA,LMT,GE,HON,UBER,ABNB,DASH,NFLX,DIS,SPOT,T,VZ,TMUS,NEE,SHOP,MELI,COIN,HOOD,SOFI,RIVN,F,GM,NBIS,SNDK,WDC,STX,CRWV"
).split(",");

const r = (x, d = 1) => (typeof x === "number" && Number.isFinite(x) ? x.toFixed(d) : "—");
const out = [];

async function one(t) {
  try {
    const res = await fetch(`${base}/api/stock/${t}?fresh=1`);
    const d = await res.json();
    if (d.error) return { t, err: String(d.error).slice(0, 55) };
    const v = d.valuation, m = d.metrics, L = v.lynch, fv = v.intrinsic.blended, p = d.quote.price;
    const flags = [];
    const ratio = fv && p ? fv / p : null;

    // 1) Fair Value ausente o absurdo
    if (fv == null) flags.push("FV=null");
    else if (ratio > 2.6) flags.push(`FV=${r(ratio, 1)}x precio`);
    else if (ratio < 0.4) flags.push(`FV=${r(ratio, 2)}x precio`);
    // 2) Insumos del modelo
    if (!L || !(L.eps > 0)) flags.push("EPS≤0");
    if (v.growthInputs?.analistas == null) flags.push("sin estimación analistas");
    const inputs = Object.values(v.growthInputs ?? {}).filter((x) => x != null).length;
    if (inputs < 2) flags.push(`solo ${inputs} insumo(s) de crecimiento`);
    // 3) P/E justo degenerado (pegado a un extremo)
    if (L && Math.abs(L.fairPe - 10) < 0.05) flags.push("P/E justo en el piso 10x");
    if (L && Math.abs(L.fairPe - L.capPe) < 0.05) flags.push(`P/E justo en el tope ${L.capPe}x`);
    // 4) Coherencia gráfico ↔ tarjeta
    const last = d.fvHistory?.points?.at(-1)?.fv;
    if (fv != null && last != null && Math.abs(last - fv) > 0.5) flags.push("gráfico ≠ tarjeta");
    if (!d.fvHistory) flags.push("sin serie de Fair Value");
    // 5) Datos base
    if (m.marketCap == null) flags.push("sin capitalización");
    if ((d.fundamentals?.annual?.length ?? 0) < 4) flags.push(`${d.fundamentals?.annual?.length ?? 0} años de estados`);
    if ((d.history?.daily?.length ?? 0) < 200) flags.push("sin histórico de precios");
    if ((d.peers?.rows?.length ?? 0) < 3) flags.push("pares<3");
    if ((d.sentiment?.news?.length ?? 0) === 0) flags.push("sin noticias");

    return { t, p, fv, mos: v.marginOfSafety, eps: L?.eps, src: L?.epsSource, g: L?.growth, fpe: L?.fairPe, cap: L?.capPe, cyc: d.risk.cyclical, sig: d.score.signal.label, flags };
  } catch (e) {
    return { t, err: String(e).slice(0, 55) };
  }
}

const q = [...list];
await Promise.all(Array.from({ length: 2 }, async () => { while (q.length) out.push(await one(q.shift())); }));
out.sort((a, b) => list.indexOf(a.t) - list.indexOf(b.t));

console.log("TICKER  PRECIO      FV   FV/P   EPS  src   g%  P/E  cap  cic  SEÑAL         ANOMALÍAS");
let bad = 0;
for (const o of out) {
  if (o.err) { console.log(`${o.t.padEnd(7)} ERROR ${o.err}`); bad++; continue; }
  if (o.flags.length) bad++;
  console.log(
    `${o.t.padEnd(7)}${r(o.p, 2).padStart(8)}${r(o.fv, 1).padStart(8)}${(o.fv && o.p ? (o.fv / o.p).toFixed(2) : "—").padStart(6)}` +
    `${r(o.eps, 2).padStart(7)} ${(o.src ?? "—").padEnd(4)}${r(o.g, 0).padStart(5)}${r(o.fpe, 1).padStart(5)}${String(o.cap ?? "—").padStart(5)}` +
    `${(o.cyc ? "sí" : "no").padStart(5)}  ${(o.sig ?? "—").padEnd(13)} ${o.flags.join(" · ")}`
  );
}
console.log(`\n${out.length} acciones · ${bad} con anomalías · ${out.length - bad} limpias`);
