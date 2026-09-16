"use client";

import { useEffect, useState, type ComponentType } from "react";

export function LandingCell() {
  const [Stage, setStage] = useState<ComponentType<{ interactive?: boolean }> | null>(null);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) {
      return;
    }
    void import("@/components/landing/OrbitStage")
      .then((mod) => setStage(() => mod.OrbitStage))
      .catch(() => {
        setStage(null);
      });
  }, []);

  return (
    <div className="landing-cell">
      <div className="landing-cell-fallback" aria-hidden="true">
        <span className="landing-cell-block landing-cell-block--base" />
        <span className="landing-cell-block landing-cell-block--mast" />
        <span className="landing-cell-block landing-cell-block--arm" />
        <span className="landing-cell-block landing-cell-block--load" />
      </div>
      {Stage ? <Stage interactive /> : null}
    </div>
  );
}
