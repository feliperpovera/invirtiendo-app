"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Logo";
import { SearchBox } from "./SearchBox";

const links = [
  { href: "/", label: "Analizar" },
  { href: "/portafolio", label: "Portafolio" },
  { href: "/ranking", label: "Ranking" },
  { href: "/miedo-codicia", label: "Fear & Greed" },
];

/** Barra simple: logo, buscador y las dos secciones (en móvil el buscador baja a una segunda fila). */
export function Nav() {
  const pathname = usePathname();
  const item = (activo: boolean) =>
    `px-3 py-1.5 rounded-full whitespace-nowrap text-sm font-semibold transition-colors ${activo ? "bg-[#33312b] text-cream" : "text-[#d8cdb9] hover:text-cream hover:bg-[#33312b]"}`;

  return (
    <header className="sticky top-0 z-40 bg-ink text-cream border-b border-[#3a3831]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
        <Link href="/" className="shrink-0" aria-label="Invirtiendo, inicio">
          <Wordmark dark />
        </Link>
        <div className="flex-1 max-w-md hidden md:block">
          <SearchBox compact />
        </div>
        <nav className="ml-auto hidden sm:flex items-center gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined} className={item(pathname === l.href)}>
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <nav className="sm:hidden flex gap-1 overflow-x-auto px-3 pb-2 -mt-1">
        {links.map((l) => (
          <Link key={l.href} href={l.href} aria-current={pathname === l.href ? "page" : undefined} className={item(pathname === l.href)}>
            {l.label}
          </Link>
        ))}
      </nav>
      {pathname !== "/" && (
        <div className="md:hidden px-4 pb-3">
          <SearchBox compact />
        </div>
      )}
    </header>
  );
}
