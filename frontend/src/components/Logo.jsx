// Scales of justice emblem (gold on navy)
export default function Logo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="SafeVoice PK">
      <circle cx="32" cy="32" r="30" fill="#0b1f3a" stroke="#c9a227" strokeWidth="2.5" />
      <g stroke="#c9a227" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 12v34" />
        <path d="M17 19h30" />
        <path d="M17 19l-7 15h14z" />
        <path d="M47 19l-7 15h14z" />
        <path d="M22 50h20" />
        <circle cx="32" cy="12" r="1.6" fill="#c9a227" />
      </g>
    </svg>
  );
}
