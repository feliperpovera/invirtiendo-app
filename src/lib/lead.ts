"use client";

import { useEffect, useState } from "react";

/**
 * Registro rápido (nombre, apellido, correo) que se pide UNA sola vez. Funciona como un
 * inicio de sesión sin contraseña: el usuario es lo que va antes de la @ del correo,
 * queda guardado en este navegador y, en otro dispositivo, basta con el correo para
 * volver a entrar sin escribir nada más.
 */
export interface Lead {
  nombre: string;
  apellido: string;
  email: string;
  usuario: string;
  at: number;
}

const KEY = "invirtiendo.lead.v1";
const EVT = "invirtiendo:lead";

/** ana.perez@gmail.com → ana.perez */
export const usuarioDe = (email: string) => email.trim().toLowerCase().split("@")[0] || "";

export function leerLead(): Lead | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const l = JSON.parse(raw) as Partial<Lead>;
    if (!l || typeof l.email !== "string" || !l.email.includes("@")) return null;
    return { nombre: l.nombre ?? "", apellido: l.apellido ?? "", email: l.email, usuario: l.usuario || usuarioDe(l.email), at: l.at ?? Date.now() };
  } catch {
    return null;
  }
}

export function guardarLead(l: Omit<Lead, "usuario"> & { usuario?: string }) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...l, usuario: l.usuario || usuarioDe(l.email) }));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* modo privado: se pedirá otra vez la próxima visita */
  }
}

export function cerrarSesion() {
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* nada que cerrar */
  }
}

/** `undefined` = todavía no leímos el navegador (evita mostrar el formulario a quien ya se registró). */
export function useLead(): { lead: Lead | null | undefined; unlock: typeof guardarLead; salir: () => void } {
  const [lead, setLead] = useState<Lead | null | undefined>(undefined);
  useEffect(() => {
    setLead(leerLead());
    const on = () => setLead(leerLead());
    window.addEventListener(EVT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return { lead, unlock: guardarLead, salir: cerrarSesion };
}
