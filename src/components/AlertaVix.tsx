"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export const UMBRAL_VIX = 30;
const CLAVE = "vix-avisado";

/** Último VIX cada 5 minutos; si cruza 30 y el navegador lo permite, una notificación por día. */
function useVix() {
  const [v, setV] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    const cargar = () =>
      fetch("/api/vix?v=2&solo=1")
        .then((r) => r.json())
        .then((j) => {
          if (!vivo || typeof j.actual !== "number") return;
          setV(j.actual);
          avisar(j.actual);
        })
        .catch(() => {});
    cargar();
    const t = setInterval(cargar, 5 * 60_000);
    return () => { vivo = false; clearInterval(t); };
  }, []);
  return v;
}

function avisar(v: number) {
  if (v < UMBRAL_VIX || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const hoy = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(CLAVE) === hoy) return;
    localStorage.setItem(CLAVE, hoy);
  } catch { /* sin almacenamiento: avisa igual */ }
  new Notification(`VIX en ${v.toFixed(2)}: miedo en el mercado`, { body: `Superó ${UMBRAL_VIX}. Revisa el Fear & Greed en Invirtiendo.`, icon: "/brand/icono.png", tag: "vix" });
}

/** Franja en toda la página mientras el VIX esté en 30 o más. */
export function AvisoVix() {
  const v = useVix();
  if (v == null || v < UMBRAL_VIX) return null;
  return (
    <Link href="/miedo-codicia" role="alert" className="block bg-[var(--sig-avoid)] text-cream text-center text-sm font-bold px-4 py-2 hover:opacity-90">
      ⚠︎ VIX en <span className="num">{v.toFixed(2)}</span>: por encima de {UMBRAL_VIX}, miedo en el mercado · ver Fear &amp; Greed →
    </Link>
  );
}

/** Botón para recibir la notificación del navegador (funciona mientras la página esté abierta en alguna pestaña). */
export function BotonAvisoVix() {
  const [estado, setEstado] = useState<NotificationPermission | "no" | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- el permiso solo existe en el navegador
  useEffect(() => setEstado(typeof Notification === "undefined" ? "no" : Notification.permission), []);
  if (estado == null || estado === "no") return null;
  if (estado === "granted") return <p className="text-xs text-ink-soft">🔔 Te avisaremos en este navegador cuando el VIX supere {UMBRAL_VIX} (con la página abierta).</p>;
  if (estado === "denied") return <p className="text-xs text-ink-soft">Las notificaciones están bloqueadas para esta página: actívalas en los ajustes del navegador.</p>;
  return (
    <button type="button" onClick={() => Notification.requestPermission().then(setEstado)} className="rounded-full border border-line px-3 py-1.5 text-xs font-bold hover:border-ink">
      🔔 Avisarme en este navegador cuando el VIX supere {UMBRAL_VIX}
    </button>
  );
}
