import type { Persona } from "@/lib/providers/radar";

export const QUIEN: Record<Persona, { nombre: string; rol: string; fuente: string; corto: string }> = {
  pelosi: { nombre: "Nancy Pelosi", rol: "Congresista de EE. UU. (California)", fuente: "Reportes PTR · Cámara de Representantes", corto: "Pelosi" },
  trump: { nombre: "Donald Trump", rol: "Presidente de EE. UU.", fuente: "Formulario OGE 278-T · Oficina de Ética del Gobierno", corto: "Trump" },
  thiel: { nombre: "Peter Thiel", rol: "Thiel Macro LLC", fuente: "Formulario 13F · SEC", corto: "Thiel" },
  berkshire: { nombre: "Berkshire Hathaway", rol: "El portafolio de Warren Buffett", fuente: "Formulario 13F · SEC", corto: "Buffett" },
  ackman: { nombre: "Bill Ackman", rol: "Pershing Square Capital", fuente: "Formulario 13F · SEC", corto: "Ackman" },
  druckenmiller: { nombre: "Stanley Druckenmiller", rol: "Duquesne Family Office", fuente: "Formulario 13F · SEC", corto: "Druckenmiller" },
  dalio: { nombre: "Ray Dalio", rol: "Bridgewater Associates", fuente: "Formulario 13F · SEC", corto: "Dalio" },
  wood: { nombre: "Cathie Wood", rol: "ARK Invest", fuente: "Formulario 13F · SEC", corto: "Wood" },
  tepper: { nombre: "David Tepper", rol: "Appaloosa", fuente: "Formulario 13F · SEC", corto: "Tepper" },
  soros: { nombre: "George Soros", rol: "Soros Fund Management", fuente: "Formulario 13F · SEC", corto: "Soros" },
};
