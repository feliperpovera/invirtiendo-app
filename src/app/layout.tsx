import type { Metadata, Viewport } from "next";
import { Fraunces, Figtree } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { TickerTape } from "@/components/TickerTape";
import { Analytics } from "@vercel/analytics/next";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: "variable",
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  weight: "variable",
  variable: "--font-figtree",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Invirtiendo · Evaluador de acciones", template: "%s · Invirtiendo" },
  description: "Evalúa acciones de EE. UU. con el proceso de 7 filtros estilo Buffett: negocio, moat, números, dueños, diez años, precio y plan. Datos reales, noticias calificadas y watchlist.",
  icons: { icon: "/brand/icono.png" },
  openGraph: { title: "Invirtiendo · Evaluador de acciones", description: "El checklist Invirtiendo con datos reales.", images: ["/brand/logo-horizontal.png"] },
};

export const viewport: Viewport = { themeColor: "#22211d", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${fraunces.variable} ${figtree.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <Nav />
        <TickerTape />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">{children}</main>
        {/* Redes: el contenido nace en IG/TikTok, la página lleva de vuelta allá */}
        <section className="mt-12 bg-ink text-cream">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-2xl leading-tight">Síguenos y aprende a invertir cada semana</p>
              <p className="text-sm text-[#d8cdb9]">Análisis de acciones, resultados y el portafolio real en videos cortos.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="https://www.instagram.com/invirtiendoo/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-terracotta px-4 py-2.5 font-bold text-cream hover:opacity-90">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
                Instagram @invirtiendoo
              </a>
              <a href="https://www.tiktok.com/@invirtiendoo_" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-cream/40 px-4 py-2.5 font-bold text-cream hover:bg-cream/10">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.7 5.7 0 1 0 4.9 5.7V9.1a7.4 7.4 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z" /></svg>
                TikTok @invirtiendoo_
              </a>
            </div>
          </div>
        </section>
        <footer className="border-t border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm text-ink-soft">
            <p>
              <span className="font-semibold text-ink">@Invirtiendoo</span> · Información educativa. No es recomendación ni asesoría financiera.
            </p>
            <p>Fair Values estimados con supuestos declarados. Precios con retraso de hasta 15 min. <a href="/fuentes" className="underline">Fuentes de datos</a></p>
          </div>
        </footer>
        {/* Visitas por día, páginas, países y de dónde llegan: panel Analytics del proyecto en Vercel */}
        <Analytics />
      </body>
    </html>
  );
}
