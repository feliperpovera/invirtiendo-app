"use client";

import { useSyncExternalStore } from "react";
import { timeAgo } from "@/lib/format";

const subscribe = (cb: () => void) => {
  const t = setInterval(cb, 30000);
  return () => clearInterval(t);
};

/** Texto relativo ("hace 3 min") que solo se pinta en el cliente: evita desajustes de hidratación. */
export function TimeAgo({ ts, prefix = "" }: { ts: number | string; prefix?: string }) {
  const v = useSyncExternalStore(subscribe, () => `${prefix}${timeAgo(ts)}`, () => "");
  return <span suppressHydrationWarning>{v}</span>;
}

/** Fecha/hora local completa, solo en cliente. */
export function LocalDateTime({ ts }: { ts: number }) {
  const v = useSyncExternalStore(subscribe, () => new Date(ts).toLocaleString("es-CO"), () => "");
  return <span suppressHydrationWarning>{v}</span>;
}
