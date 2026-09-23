/** Marca Invirtiendo: toro (cuernos + cabeza) en terracota + wordmark. */
export function BullMark({ size = 28, color = "var(--terracotta)", className }: { size?: number; color?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className={className}>
      <path d="M22 26 C 10 44, 22 62, 42 62" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
      <path d="M78 26 C 90 44, 78 62, 58 62" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" />
      <circle cx="50" cy="70" r="16" fill={color} />
    </svg>
  );
}

export function Wordmark({ dark = false, size = 22 }: { dark?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <BullMark size={size + 6} />
      <span className="font-display" style={{ fontSize: size, color: dark ? "var(--cream)" : "var(--ink)", lineHeight: 1 }}>
        invirtiendo
      </span>
    </span>
  );
}
