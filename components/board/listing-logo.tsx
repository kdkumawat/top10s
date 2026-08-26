import { cn } from "@/lib/utils";

interface ListingLogoProps {
  src: string | null;
  name: string;
  size?: number;
  className?: string;
}

/** Pick a deterministic accent for the fallback letter avatar. */
function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function ListingLogo({ src, name, size = 40, className }: ListingLogoProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const hue = hueFor(name);

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={cn("rounded-md object-cover", className)}
        loading="lazy"
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={name}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, hsl(${hue} 60% 35%), hsl(${(hue + 40) % 360} 60% 25%))`,
      }}
      className={cn(
        "flex items-center justify-center rounded-md font-display text-fg",
        className,
      )}
    >
      <span style={{ fontSize: size * 0.5 }}>{initial}</span>
    </div>
  );
}
