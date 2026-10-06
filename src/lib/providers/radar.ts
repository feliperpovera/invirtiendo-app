import { getDocumentProxy } from "unpdf";

/**
 * Radar del Poder: qué compran y venden cuatro de los inversionistas más vigilados de EE. UU.,
 * leído de sus reportes oficiales (sin APIs de pago):
 * - Peter Thiel (Thiel Macro LLC) y Berkshire Hathaway: formulario 13F trimestral en SEC EDGAR.
 * - Nancy Pelosi: reportes de transacciones (PTR) de la Cámara de Representantes, PDF con texto.
 * - Donald Trump: OGE Form 278-T, PDF escaneado con OCR; los nombres se emparejan con la lista de la SEC.
 * Un job semanal (`/api/cron/radar`) lo recalcula y lo guarda en la tabla `radar_poder`.
 */
export type Persona = "thiel" | "berkshire" | "pelosi" | "trump";
export interface Movimiento { ticker: string; nombre: string; veces: number; ultima: string }
export interface Posicion { ticker: string | null; nombre: string; peso: number; cambio: "nueva" | "aumentó" | "redujo" | "igual"; cambioPct: number | null }
export interface PerfilRadar {
  persona: Persona;
  periodo: string;
  fuenteUrl: string;
  posiciones: Posicion[]; // solo 13F: peso en % del portafolio reportado
  compras: Movimiento[];
  ventas: Movimiento[];
}

const UA = "Invirtiendo info@revupagencygroup.com";
const get = (u: string, ms = 30000) => fetch(u, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(ms) });

/* ── Nombre de empresa → ticker, con la lista oficial de la SEC ─────────────────── */
const SOBRA = new Set(["INC", "CORP", "CORPORATION", "CO", "COM", "LTD", "PLC", "CL", "CLASS", "A", "B", "C", "NEW", "THE", "UNSOLICITED", "SHS", "ORD", "COMMON", "STOCK", "PAR", "HLDGS", "HOLDINGS", "GROUP", "SA", "NV", "AG", "DEL", "LLC", "LP", "DE"]);
// Los 13F abrevian ("AMERICAN ELEC PWR"); se abrevian ambos lados igual para que coincidan.
const ABREV: Record<string, string> = { ELECTRIC: "ELEC", POWER: "PWR", AMERICAN: "AMER", AMERICA: "AMER", FINANCIAL: "FINL", SERVICES: "SVCS", INTERNATIONAL: "INTL", TECHNOLOGIES: "TECH", TECHNOLOGY: "TECH", COMPANY: "CO", COMPANIES: "COS", INDUSTRIES: "INDS", PHARMACEUTICALS: "PHARMA", SYSTEMS: "SYS", MANAGEMENT: "MGMT", COMMUNICATIONS: "COMM", ENERGY: "ENERGY" };
export const normalizar = (s: string) =>
  s.toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9 ]+/g, " ").split(/\s+/).map((w) => ABREV[w] ?? w).filter((w) => w && !SOBRA.has(w) && !/^\d/.test(w)).join(" ");

let indice: Promise<Map<string, string>> | null = null;
function tickers() {
  indice ??= get("https://www.sec.gov/files/company_tickers.json").then(async (r) => {
    const j = (await r.json()) as Record<string, { ticker: string; title: string }>;
    const m = new Map<string, string>();
    for (const { ticker, title } of Object.values(j)) {
      const k = normalizar(title);
      if (k && !m.has(k)) m.set(k, ticker); // el primero es la clase principal
    }
    return m;
  });
  return indice;
}
export function aTicker(m: Map<string, string>, nombre: string): string | null {
  const w = normalizar(nombre).split(" ").filter(Boolean);
  // del nombre completo hacia atrás: "NVIDIA" encuentra "NVIDIA" aunque el OCR agregue basura al final
  for (let n = w.length; n >= 1; n--) {
    const k = w.slice(0, n).join(" ");
    if (n === 1 && k.length < 4) break;
    const t = m.get(k);
    if (t) return t;
  }
  return null;
}

/* ── 13F (SEC EDGAR) ──────────────────────────────────────────────────────────── */
type Fila13F = { nombre: string; valor: number; acciones: number };
async function tabla13F(cik: number, acc: string): Promise<Fila13F[]> {
  const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, "")}`;
  const items = ((await (await get(`${base}/index.json`)).json()) as { directory: { item: Array<{ name: string }> } }).directory.item;
  const xml = items.map((i) => i.name).find((n) => /\.xml$/i.test(n) && !/primary_doc/i.test(n));
  if (!xml) return [];
  const s = await (await get(`${base}/${xml}`)).text();
  const out = new Map<string, Fila13F>();
  for (const b of s.split(/<(?:\w+:)?infoTable>/).slice(1)) {
    const tag = (t: string) => b.match(new RegExp(`<(?:\\w+:)?${t}>([^<]*)<`))?.[1]?.trim() ?? "";
    if (tag("putCall")) continue; // opciones aparte: el radar mira acciones
    const nombre = tag("nameOfIssuer");
    const f = out.get(nombre) ?? { nombre, valor: 0, acciones: 0 };
    f.valor += Number(tag("value")) || 0;
    f.acciones += Number(tag("sshPrnamt")) || 0;
    out.set(nombre, f);
  }
  return [...out.values()];
}

export async function radar13F(persona: "thiel" | "berkshire", cik: number): Promise<PerfilRadar> {
  const sub = (await (await get(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, "0")}.json`)).json()) as {
    filings: { recent: { form: string[]; accessionNumber: string[]; reportDate: string[] } };
  };
  const r = sub.filings.recent;
  const idx = r.form.map((f, i) => (f === "13F-HR" ? i : -1)).filter((i) => i >= 0).slice(0, 2);
  const [hoy, antes] = await Promise.all(idx.map((i) => tabla13F(cik, r.accessionNumber[i])));
  const m = await tickers();
  const total = hoy.reduce((s, f) => s + f.valor, 0) || 1;
  // Se compara por ticker: el mismo emisor cambia de nombre entre trimestres ("CHUBB LIMITED" / "CHUBB LTD SWITZ")
  const clave = (f: Fila13F) => aTicker(m, f.nombre) ?? f.nombre;
  const prev = new Map((antes ?? []).map((f) => [clave(f), f]));
  const posiciones: Posicion[] = hoy
    .map((f) => {
      const p = prev.get(clave(f));
      const cambioPct = p && p.acciones > 0 ? ((f.acciones - p.acciones) / p.acciones) * 100 : null;
      const cambio: Posicion["cambio"] = !p ? "nueva" : cambioPct! > 1 ? "aumentó" : cambioPct! < -1 ? "redujo" : "igual";
      return { ticker: aTicker(m, f.nombre), nombre: f.nombre, peso: (f.valor / total) * 100, cambio, cambioPct };
    })
    .sort((a, b) => b.peso - a.peso);
  const fecha = r.reportDate[idx[0]];
  const mov = (p: Posicion): Movimiento | null => (p.ticker ? { ticker: p.ticker, nombre: p.nombre, veces: 1, ultima: fecha } : null);
  const enHoy = new Set(hoy.map(clave));
  const vendidas = (antes ?? []).filter((f) => !enHoy.has(clave(f))).map((f) => ({ ticker: aTicker(m, f.nombre), nombre: f.nombre, peso: 0, cambio: "redujo" as const, cambioPct: -100 }));
  return {
    persona,
    periodo: `13F al ${fecha}`,
    fuenteUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=13F-HR`,
    posiciones: posiciones.slice(0, 12),
    compras: posiciones.filter((p) => p.cambio === "nueva" || p.cambio === "aumentó").map(mov).filter((x): x is Movimiento => !!x).slice(0, 12),
    ventas: [...vendidas, ...posiciones.filter((p) => p.cambio === "redujo")].map(mov).filter((x): x is Movimiento => !!x).slice(0, 12),
  };
}

/* ── PDF → líneas (agrupa el texto por renglón, celdas separadas con " | ") ───────── */
async function lineasPdf(url: string): Promise<string[]> {
  const buf = new Uint8Array(await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(170000) })).arrayBuffer()); // los 278-T escaneados pesan 10-30 MB
  const pdf = await getDocumentProxy(buf);
  const out: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    const filas = new Map<number, Array<{ x: number; s: string }>>();
    for (const it of tc.items as Array<{ str?: string; transform: number[] }>) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5] / 3);
      (filas.get(y) ?? filas.set(y, []).get(y)!).push({ x: it.transform[4], s: it.str.trim() });
    }
    [...filas.entries()].sort((a, b) => b[0] - a[0]).forEach(([, c]) => out.push(c.sort((a, b) => a.x - b.x).map((i) => i.s).join(" | ")));
  }
  return out;
}

function agrupar(t: Array<{ ticker: string; nombre: string; fecha: string }>): Movimiento[] {
  const m = new Map<string, Movimiento>();
  for (const x of t) {
    const v = m.get(x.ticker) ?? { ticker: x.ticker, nombre: x.nombre, veces: 0, ultima: x.fecha };
    v.veces++;
    if (x.fecha > v.ultima) v.ultima = x.fecha;
    m.set(x.ticker, v);
  }
  return [...m.values()].sort((a, b) => b.veces - a.veces || b.ultima.localeCompare(a.ultima)).slice(0, 15);
}
const iso = (mdY: string) => {
  const [mm, dd, yy] = mdY.split("/").map((x) => x.replace(/\D/g, ""));
  return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

/* ── Pelosi: PTR de la Cámara ─────────────────────────────────────────────────── */
export function parsePelosi(lineas: string[]) {
  const out: Array<{ ticker: string; nombre: string; fecha: string; compra: boolean }> = [];
  lineas.forEach((l, i) => {
    const m = l.match(/^(?:SP|JT|DC|SELF)?\s*\|?\s*(.+?)\s*\|\s*(P|S|S \(partial\))\s*\|\s*(\d{2}\/\d{2}\/\d{4})/);
    if (!m) return;
    const tk = `${l} ${lineas[i + 1] ?? ""}`.match(/\(([A-Z][A-Z.]{0,5})\)/)?.[1];
    if (tk) out.push({ ticker: tk, nombre: m[1].replace(/\s*-\s*Common Stock.*/i, ""), fecha: iso(m[3]), compra: m[2] === "P" });
  });
  return out;
}
export async function radarPelosi(): Promise<PerfilRadar> {
  const anio = new Date().getUTCFullYear();
  const urls: string[] = [];
  for (const y of [anio, anio - 1]) {
    const html = await (await fetch("https://disclosures-clerk.house.gov/FinancialDisclosure/ViewMemberSearchResult", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" }, body: `LastName=Pelosi&FilingYear=${y}&State=&District=`, signal: AbortSignal.timeout(30000) })).text();
    urls.push(...[...html.matchAll(/href="(public_disc\/ptr-pdfs\/[^"]+\.pdf)"/g)].map((x) => `https://disclosures-clerk.house.gov/${x[1]}`));
  }
  const desde = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  const trx = (await Promise.all(urls.map((u) => lineasPdf(u).then(parsePelosi).catch(() => [])))).flat().filter((t) => t.fecha >= desde);
  return {
    persona: "pelosi",
    periodo: "Últimos 12 meses de reportes PTR",
    fuenteUrl: "https://disclosures-clerk.house.gov/FinancialDisclosure",
    posiciones: [],
    compras: agrupar(trx.filter((t) => t.compra)),
    ventas: agrupar(trx.filter((t) => !t.compra)),
  };
}

/* ── Trump: OGE 278-T (escaneado) ─────────────────────────────────────────────── */
/** La OGE no publica un índice consultable de los reportes del presidente: se agregan aquí al salir. */
export const TRUMP_278T = [
  "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/E590116FC9631E9885258E7A002DE209/$FILE/Donald-J-Trump-09.8.2026-278T.pdf",
  "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/2BF91F890F718ACB85258E5B002DE16B/$FILE/Donald-J-Trump-08.12.2026-278T.pdf",
  "https://extapps2.oge.gov/201/Presiden.nsf/PAS+Index/AC43530823BD60D485258E27002DDEF7/$FILE/Donald-J-Trump-06.25.2026-278T.pdf",
];
export function parseTrump(lineas: string[], m: Map<string, string>, anio: number) {
  const out: Array<{ ticker: string; nombre: string; fecha: string; compra: boolean }> = [];
  for (const l of lineas) {
    if (/\bDue\b|%/.test(l)) continue; // bonos municipales
    const c = l.split(" | ");
    const k = c.findIndex((x) => /urch|rcha|un:h|ourc|sale|sold/i.test(x));
    if (k < 1 || !/^\d{1,4}\b/.test(c[0])) continue;
    const nombre = c.slice(0, k).join(" ").replace(/^\d+\s*/, "").replace(/UNSOLICITED|SOLICITED/gi, "").trim();
    const tk = aTicker(m, nombre);
    if (!tk) continue;
    const f = c.slice(k).join(" ").match(/(\d{1,2})\s*[/l1I]\s*(\d{1,2})\s*[/l1I]\s*(\d{4})/);
    const fecha = f ? `${anio}-${f[1].padStart(2, "0")}-${f[2].padStart(2, "0")}` : `${anio}-01-01`;
    out.push({ ticker: tk, nombre, fecha, compra: !/sale|sold/i.test(c[k]) });
  }
  return out;
}
export async function radarTrump(): Promise<PerfilRadar> {
  const m = await tickers();
  const trx = (
    await Promise.all(TRUMP_278T.map((u) => lineasPdf(u).then((l) => parseTrump(l, m, Number(u.match(/\.(20\d\d)-278T/)?.[1] ?? new Date().getUTCFullYear()))).catch(() => [])))
  ).flat();
  return {
    persona: "trump",
    periodo: `${TRUMP_278T.length} reportes 278-T más recientes`,
    fuenteUrl: TRUMP_278T[0],
    posiciones: [],
    compras: agrupar(trx.filter((t) => t.compra)),
    ventas: agrupar(trx.filter((t) => !t.compra)),
  };
}

/* ── Persistencia ─────────────────────────────────────────────────────────────── */
const sb = () => ({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY });
export async function guardarRadar(p: PerfilRadar) {
  const { url, key } = sb();
  if (!url || !key) throw new Error("Supabase sin configurar");
  const r = await fetch(`${url}/rest/v1/rpc/radar_guardar`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_persona: p.persona, p_datos: p }) });
  if (!r.ok) throw new Error(`radar_guardar ${r.status}`);
}
export async function leerRadar(): Promise<Array<PerfilRadar & { actualizado: string }>> {
  const { url, key } = sb();
  if (!url || !key) return [];
  const r = await fetch(`${url}/rest/v1/radar_poder?select=datos,actualizado`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store" });
  if (!r.ok) return [];
  return ((await r.json()) as Array<{ datos: PerfilRadar; actualizado: string }>).map((x) => ({ ...x.datos, actualizado: x.actualizado }));
}
