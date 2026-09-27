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
      <p className="landing-section-kicker">Parts quote</p>
      <h2 className="landing-section-title">One machine hub. Quote from the model.</h2>
      <p className="landing-section-lede">
        Parts, tickets, manuals, and service reports on one machine. The chapter below is
        the parts quote path — PN on the model through PO confirmed.
      </p>
    </div>
  );
}
