/** Ikon Material Symbols Outlined (font dimuat dari Google Fonts). */
export default function Icon({
  name,
  className = "",
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={`material-symbols-outlined ${className}`}
      style={
        filled
          ? { fontVariationSettings: `"FILL" 1, "wght" 400, "GRAD" 0, "opsz" 24` }
          : undefined
      }
    >
      {name}
    </span>
  );
}
