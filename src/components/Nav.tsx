"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Logo";
import { SearchBox } from "./SearchBox";
import { useLead } from "@/lib/lead";

const COMPARAR = [
  { href: "/comparar", label: "Acciones" },
  { href: "/comparar-etf", label: "ETFs" },
];

const MERCADOS = [
  { href: "/mercados", label: "Resumen" },
  { href: "/mapa", label: "Mapa de calor" },
  { href: "/calendario", label: "Calendario" },
  { href: "/noticias", label: "Noticias" },
];

/** Submenú desplegable del escritorio (Comparar, Mercados): se cierra al navegar o con clic fuera. */
function Menu({ titulo, items, pathname, item }: { titulo: string; items: Array<{ href: string; label: string }>; pathname: string; item: (a: boolean) => string }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setAbierto(false), [pathname]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", esc);
    };
  }, [abierto]);
  const activo = items.some((c) => pathname === c.href);
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setAbierto((c) => !c)} aria-expanded={abierto} aria-haspopup="true" className={`${item(activo || abierto)} inline-flex items-center gap-1.5`}>
        {titulo}
        <span aria-hidden className="transition-transform duration-200" style={{ transform: abierto ? "rotate(180deg)" : "none" }}>
          ▾
        </span>
      </button>
      {abierto && (
        <div className="absolute right-0 mt-2 w-48 rounded-2xl bg-ink-2 border border-[#3a3831] shadow-lg p-1.5 rise">
          {items.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              onClick={() => setAbierto(false)}
              aria-current={pathname === c.href ? "page" : undefined}
              className={`block px-3 py-2 rounded-xl transition-colors ${pathname === c.href ? "bg-terracotta text-cream" : "text-[#d8cdb9] hover:text-cream hover:bg-[#3a3831]"}`}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const links = [
  { href: "/", label: "Home" },
  { href: "/ranking", label: "Ranking" },
  { href: "/portafolio", label: "Portafolio" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/simulador", label: "Simulador" },
  { href: "/radar", label: "Radar del Poder" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { lead, salir } = useLead();

  // Cerrar al navegar · bloquear el scroll del fondo · cerrar con Escape
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, []);

  const item = (activo: boolean) =>
    `px-3 py-1.5 rounded-full transition-colors ${activo ? "bg-[#33312b] text-cream" : "text-[#d8cdb9] hover:text-cream hover:bg-[#33312b]"}`;

  return (
    <header className="sticky top-0 z-40 bg-ink text-cream border-b border-[#3a3831]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center gap-3">
        <Link href="/" className="shrink-0" aria-label="Invirtiendo, inicio">
          <Wordmark dark />
        </Link>

        {/* Escritorio */}
        <div className="flex-1 max-w-md hidden md:block">
          <SearchBox compact />
        </div>
        <nav className="ml-auto hidden md:flex items-center gap-1 text-sm">
          {links.slice(0, 3).map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined} className={item(pathname === l.href)}>
              {l.label}
            </Link>
          ))}

          <Menu titulo="Mercados" items={MERCADOS} pathname={pathname} item={item} />
          <Menu titulo="Comparar" items={COMPARAR} pathname={pathname} item={item} />

          {links.slice(3).map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined} className={item(pathname === l.href)}>
              {l.label}
            </Link>
          ))}
          {lead && (
            <span className="ml-2 inline-flex items-center gap-2 pl-3 border-l border-[#3a3831] text-[#d8cdb9]">
              <span className="font-semibold text-cream truncate max-w-[10rem]" title={lead.email}>{lead.usuario}</span>
              <button type="button" onClick={salir} className="text-xs underline hover:text-cream" title="Cerrar sesión en este navegador">
                salir
              </button>
            </span>
          )}
        </nav>

        {/* Móvil */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          aria-controls="menu-movil"
          className="ml-auto md:hidden w-11 h-11 -mr-2 inline-flex items-center justify-center rounded-full hover:bg-[#33312b] active:bg-[#3a3831] transition-colors"
        >
          <span className="relative block w-5 h-4" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute left-0 w-5 h-0.5 bg-cream rounded-full transition-all duration-200"
                style={{
                  top: open ? "7px" : `${i * 7}px`,
                  transform: open ? `rotate(${i === 2 ? -45 : 45}deg)` : "none",
                  opacity: open && i === 1 ? 0 : 1,
                }}
              />
            ))}
          </span>
        </button>
      </div>

      {/* Panel móvil */}
      <div
        id="menu-movil"
        className={`md:hidden overflow-hidden border-t border-[#3a3831] transition-[max-height,opacity] duration-300 ease-out ${open ? "max-h-[85vh] opacity-100" : "max-h-0 opacity-0"}`}
      >
        <div className="px-4 py-4 space-y-3">
          <SearchBox compact />
          <nav className="grid grid-cols-2 gap-2">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={pathname === l.href ? "page" : undefined}
                className={`px-4 py-3 rounded-xl text-[0.95rem] font-semibold transition-colors ${pathname === l.href ? "bg-terracotta text-cream" : "bg-[#2f2d27] text-[#d8cdb9] active:bg-[#3a3831]"}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          {lead && (
            <div className="flex items-center justify-between rounded-xl bg-[#2f2d27] px-4 py-3 text-sm">
              <span className="text-[#d8cdb9]">
                Sesión: <b className="text-cream">{lead.usuario}</b>
              </span>
              <button type="button" onClick={salir} className="text-xs underline text-[#d8cdb9]">
                salir
              </button>
            </div>
          )}
          {/* En móvil no hay hover: los submenús se abren planos, con su título */}
          {(
            [
              ["Mercados", MERCADOS],
              ["Comparar", COMPARAR],
            ] as const
          ).map(([t, grupo]) => (
            <div key={t}>
              <p className="text-[0.68rem] uppercase tracking-[0.12em] font-bold px-1 mb-2" style={{ color: "#8d867a" }}>
                {t}
              </p>
              <nav className="grid grid-cols-2 gap-2">
                {grupo.map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    onClick={() => setOpen(false)}
                    aria-current={pathname === c.href ? "page" : undefined}
                    className={`px-4 py-3 rounded-xl text-[0.95rem] font-semibold transition-colors ${pathname === c.href ? "bg-terracotta text-cream" : "bg-[#2f2d27] text-[#d8cdb9] active:bg-[#3a3831]"}`}
                  >
                    {c.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </div>
    </header>
  );
}
