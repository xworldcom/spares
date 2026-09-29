import type { CSSProperties } from "react";

export function LandingProductStoryIntro({
  className,
  style,
  "aria-hidden": ariaHidden,
}: {
  className?: string;
  style?: CSSProperties;
  "aria-hidden"?: boolean;
}) {
  return (
    <div className={className} style={style} aria-hidden={ariaHidden}>
      <h2 className="landing-section-title">One machine hub. Quote from the model.</h2>
    </div>
  );
}
