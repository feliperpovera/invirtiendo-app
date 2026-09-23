/**
 * Smoke test de la app con Chromium headless (Playwright).
 * Uso:  npx -y playwright@1.55.0 install chromium   (una vez)
 *       node scripts/smoke.mjs [http://localhost:3000] [NVDA]
 * Verifica: hidratación sin errores, checklist interactivo, DCF editable,
 * agregar a watchlist y que la watchlist muestre la fila con precio.
 */
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3000";
const ticker = process.argv[3] ?? "NVDA";
const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text().slice(0, 200));
});
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));

const step = (name, ok, extra = "") => console.log(`${ok ? "✓" : "✗"} ${name}${extra ? " · " + extra : ""}`);

// 1) Home
await page.goto(base, { waitUntil: "networkidle" });
step("home carga", (await page.title()).includes("Invirtiendo"));
await page.waitForSelector("text=Pulso del mercado", { timeout: 20000 });
const moodOk = await page.locator("text=/Miedo|Neutral|Codicia/").first().isVisible().catch(() => false);
step("pulso del mercado", moodOk);

// 2) Evaluación
await page.goto(`${base}/accion/${ticker}`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("text=Agregar a watchlist", { timeout: 90000 });
step("evaluación renderiza e hidrata", true);
const passedBefore = await page.locator("text=/^\\d\\/7$/").first().textContent().catch(() => null);
const yesButtons = page.locator("button", { hasText: /^Sí$/ });
const nYes = await yesButtons.count();
for (let i = 0; i < nYes; i++) await yesButtons.nth(i).click();
await page.waitForTimeout(300);
const passedAfter = await page.locator("text=/^\\d\\/7$/").first().textContent().catch(() => null);
step("preguntas cualitativas cambian el veredicto", passedAfter !== passedBefore || nYes === 0, `${passedBefore} → ${passedAfter} (${nYes} respuestas)`);

// 3) DCF editable
const fvRow = () => page.locator("tr", { has: page.locator("div.font-bold", { hasText: /^Fair Value$/ }) }).first();
const viBefore = await fvRow().textContent();
const slider = page.locator('input[type="range"]').first();
await slider.focus();
// El P/E justo está acotado (10x-25x): probamos ambos extremos para salir del tope
for (let i = 0; i < 60; i++) await page.keyboard.press("ArrowRight");
await page.waitForTimeout(200);
const viUp = await fvRow().textContent();
for (let i = 0; i < 120; i++) await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(200);
const viAfter = await fvRow().textContent();
step("supuestos del modelo cambian el Fair Value", viBefore !== viAfter || viBefore !== viUp);

// 4) Watchlist
await page.click("text=Agregar a watchlist");
await page.waitForSelector("text=Actualizar en watchlist", { timeout: 5000 });
step("agregar a watchlist", true);
await page.goto(`${base}/watchlist`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(`table.table tbody tr`, { timeout: 20000 });
const rowText = await page.locator("table.table tbody tr").first().textContent();
step("watchlist muestra la fila", rowText.includes(ticker), rowText.replace(/\s+/g, " ").slice(0, 120));
await page.waitForSelector("table.table tbody tr td:nth-child(2) >> text=/\\$\\d/", { timeout: 30000 }).catch(() => {});
const priceCell = await page.locator("table.table tbody tr td:nth-child(2)").first().textContent();
step("precio en vivo en watchlist", /\$\d/.test(priceCell), priceCell.trim().slice(0, 40));

// 5) Comparar y otras páginas
for (const p of ["/comparar?t=NVDA,AMD", "/metodo", "/fuentes"]) {
  const r = await page.goto(`${base}${p}`, { waitUntil: "domcontentloaded" });
  step(`página ${p}`, r.ok());
}

const hydration = errors.filter((e) => /hydrat|Hydration/i.test(e));
step("sin errores de hidratación", hydration.length === 0, hydration[0] ?? "");
const otherErrors = errors.filter((e) => !/hydrat|Hydration|favicon|502|429/i.test(e));
step("sin otros errores de consola", otherErrors.length === 0, otherErrors[0] ?? "");
await browser.close();
process.exit(hydration.length || otherErrors.length ? 1 : 0);
