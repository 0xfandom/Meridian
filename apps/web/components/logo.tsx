// Meridian mark — a clean geometric M ( | \/ | ) whose right stroke runs
// taller and drops into a tail, reading M + "1" / markets-up.
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 128"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="20"
      strokeLinejoin="miter"
      strokeMiterlimit="8"
      strokeLinecap="butt"
      aria-label="Meridian"
    >
      <path d="M18 100 V32 L58 82 L100 16 V118" />
    </svg>
  );
}
