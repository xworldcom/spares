export function BrandMark({
  className = "",
  size = "nav",
}: {
  className?: string;
  size?: "nav" | "hero";
}) {
  const type = size === "hero" ? "text-[clamp(2.8rem,8vw,5.5rem)]" : "text-[16px]";
  return (
    <span
      className={`inline-flex items-baseline font-semibold tracking-tight ${className}`}
      aria-label="OEE360"
    >
      <span className={type}>OEE</span>
      <span className={`${type} font-medium tracking-[0.12em] opacity-70`}>360</span>
    </span>
  );
}
