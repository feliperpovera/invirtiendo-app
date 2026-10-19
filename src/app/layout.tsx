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
        <footer className="border-t border-line mt-8">
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
