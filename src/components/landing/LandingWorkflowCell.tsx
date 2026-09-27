"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { WorkflowStageAnchors } from "@/lib/ui/landing-demo";

export function LandingWorkflowCell({
  spinYaw,
  highlightPartId = null,
  onAnchors,
  interactive = false,
}: {
  spinYaw: number;
  highlightPartId?: string | null;
  onAnchors?: (anchors: WorkflowStageAnchors) => void;
  interactive?: boolean;
}) {
  const [Stage, setStage] = useState<
    ComponentType<{
      interactive?: boolean;
      spinYaw?: number;
      highlightPartId?: string | null;
      onAnchors?: (anchors: WorkflowStageAnchors) => void;
    }> | null
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
      {Stage ? (
        <Stage
          interactive={interactive}
          spinYaw={spinYaw}
          highlightPartId={highlightPartId}
          onAnchors={onAnchors}
        />
      ) : null}
    </div>
  );
}
