"use client";

import { useEffect, useState, type ComponentType } from "react";

export function LandingWorkflowCell({
  spinYaw,
  interactive = false,
}: {
  spinYaw: number;
  interactive?: boolean;
}) {
  const [Stage, setStage] = useState<
    ComponentType<{ interactive?: boolean; spinYaw?: number }> | null
  >(null);

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
    <div className="landing-workflow-cell">
      <div className="landing-cell-fallback" aria-hidden="true">
        <span className="landing-cell-block landing-cell-block--base" />
        <span className="landing-cell-block landing-cell-block--mast" />
        <span className="landing-cell-block landing-cell-block--arm" />
        <span className="landing-cell-block landing-cell-block--load" />
      </div>
      {Stage ? <Stage interactive={interactive} spinYaw={spinYaw} /> : null}
    </div>
  );
}
