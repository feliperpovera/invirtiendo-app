"use client";

import { useState } from "react";
import { useLead, usuarioDe } from "@/lib/lead";

/**
 * Registro rápido: nombre, apellido y correo UNA sola vez. La app es de libre uso; el registro
 * solo se pide para crear la watchlist, que es lo único que queda guardado a nombre de alguien.
 * Funciona como un inicio de sesión sin contraseña (ver lib/lead.ts).
 */
export function LeadForm({ detalle, onListo, className = "" }: { detalle?: string; onListo?: () => void; className?: string }) {
  const { unlock } = useLead();
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [estado, setEstado] = useState<{ enviando: boolean; error: string | null }>({ enviando: false, error: null });
  // "Ya me registré": entra solo con el correo, como un inicio de sesión sin contraseña
  const [modoEntrar, setModoEntrar] = useState(false);

  const listo = (l: { nombre: string; apellido: string; usuario?: string }) => {
    unlock({ nombre: l.nombre, apellido: l.apellido, email: email.trim().toLowerCase(), usuario: l.usuario || usuarioDe(email), at: Date.now() });
    onListo?.();
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acepta) {
      setEstado({ enviando: false, error: "Marca la casilla para autorizar el uso de tus datos." });
      return;
    }
    setEstado({ enviando: true, error: null });
    try {
      const r = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, apellido, email, acepta, origen: "watchlist", detalle }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      // Un error del servidor (no de validación) no castiga al visitante: sigue igual.
      if (!r.ok && r.status < 500) {
        setEstado({ enviando: false, error: j.error ?? "Revisa los datos." });
        return;
      }
    } catch {
      /* sin conexión: se guarda en este navegador y listo */
    }
    listo({ nombre: nombre.trim(), apellido: apellido.trim() });
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEstado({ enviando: true, error: null });
    try {
      const r = await fetch("/api/leads/entrar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string; nombre?: string; apellido?: string; usuario?: string };
      if (!r.ok) {
        setEstado({ enviando: false, error: j.error ?? "No pudimos entrar." });
        return;
      }
      listo({ nombre: j.nombre ?? "", apellido: j.apellido ?? "", usuario: j.usuario });
    } catch {
      setEstado({ enviando: false, error: "Sin conexión. Intenta de nuevo." });
    }
  };

  const error = estado.error && (
    <p className="text-sm mt-3 rounded-xl px-3 py-2" style={{ background: "var(--terracotta-tint)", color: "var(--terracotta-deep)" }} role="alert">
      {estado.error}
    </p>
  );
  const cambiar = (entrarModo: boolean) => {
    setModoEntrar(entrarModo);
    setEstado({ enviando: false, error: null });
  };

  if (modoEntrar)
    return (
      <form onSubmit={entrar} className={`card p-5 sm:p-7 w-full rise ${className}`} aria-label="Entrar con tu correo">
        <p className="eyebrow">Ya te registraste</p>
        <h2 className="font-display text-2xl sm:text-3xl leading-tight mt-1">Entra con tu correo.</h2>
        <p className="text-sm text-ink-soft mt-2">Solo el correo con el que te registraste. Tu usuario es lo que va antes de la @.</p>
        <input className="input mt-4 w-full" type="email" placeholder="Tu correo" autoComplete="email" inputMode="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        {error}
        <button type="submit" className="btn btn-primary w-full mt-4 py-3" disabled={estado.enviando}>
          {estado.enviando ? "Entrando…" : "Entrar"}
        </button>
        <button type="button" className="text-xs text-ink-soft underline mt-3 w-full text-center" onClick={() => cambiar(false)}>
          No tengo cuenta, registrarme
        </button>
      </form>
    );

  return (
    <form onSubmit={enviar} className={`card p-5 sm:p-7 w-full rise ${className}`} aria-label="Registro para crear tu watchlist">
      <p className="eyebrow">Tu watchlist</p>
      <h2 className="font-display text-2xl sm:text-3xl leading-tight mt-1">Crea tu watchlist.</h2>
      <p className="text-sm text-ink-soft mt-2">Todo lo demás es libre. Para guardar tus acciones, déjanos tu nombre y correo una sola vez.</p>

      <div className="grid grid-cols-2 gap-3 mt-4">
        <input className="input" placeholder="Nombre" autoComplete="given-name" required minLength={2} maxLength={60} value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <input className="input" placeholder="Apellido" autoComplete="family-name" required minLength={2} maxLength={60} value={apellido} onChange={(e) => setApellido(e.target.value)} />
      </div>
      <input className="input mt-3 w-full" type="email" placeholder="Tu correo" autoComplete="email" inputMode="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />

      <label className="flex items-start gap-2.5 mt-4 text-xs text-ink-soft cursor-pointer">
        <input type="checkbox" className="mt-0.5 accent-[var(--terracotta)] shrink-0" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} required />
        <span>
          Autorizo a <b className="text-ink">Invirtiendo</b> a guardar estos datos <b className="text-ink">solo para uso propio</b>: no se venden ni se comparten con nadie. Se tratan según la{" "}
          <b className="text-ink">Ley 1581 de 2012 de Colombia</b> (protección de datos personales). Puedes pedir corregirlos o borrarlos cuando quieras escribiendo a @Invirtiendoo.
        </span>
      </label>
      {error}
      <button type="submit" className="btn btn-primary w-full mt-4 py-3" disabled={estado.enviando}>
        {estado.enviando ? "Guardando…" : "Crear mi watchlist"}
      </button>
      <button type="button" className="text-xs text-ink-soft underline mt-3 w-full text-center" onClick={() => cambiar(true)}>
        Ya me registré, entrar con mi correo
      </button>
    </form>
  );
}

/** La página de Watchlist: sin registro se ve borrosa detrás del formulario. */
export function LeadGate({ children }: { children: React.ReactNode }) {
  const { lead } = useLead();
  // Ya registrado, o todavía no sabemos (primer render): se muestra el contenido.
  if (lead !== null) return <>{children}</>;
  return (
    <div className="relative min-h-[36rem]">
      <div className="max-h-[30rem] overflow-hidden select-none pointer-events-none blur-[6px] opacity-70" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-cream/70 to-cream" aria-hidden />
      <div className="absolute inset-x-0 top-6 sm:top-10 flex justify-center px-2">
        <LeadForm className="max-w-md shadow-xl" />
      </div>
    </div>
  );
}
