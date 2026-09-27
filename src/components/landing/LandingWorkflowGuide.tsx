"use client";

import type { CSSProperties } from "react";
import { workflowGuideCue } from "@/lib/ui/landing-demo";

export function LandingWorkflowGuide({
  playhead,
  reduceMotion,
}: {
  playhead: number;
  reduceMotion: boolean;
}) {
  if (reduceMotion) {
    return null;
  }

  const cue = workflowGuideCue(playhead);
  if (!cue.target) {
    return null;
  }

  const targetClass =
    cue.target === "scroll"
      ? "landing-workflow-guide is-scroll"
      : "landing-workflow-guide";

  return (
    <div
      className={targetClass}
      data-guide={cue.target}
      aria-hidden="true"
      style={
        {
          "--wf-guide-x": `${cue.x}%`,
          "--wf-guide-y": `${cue.y}%`,
        } as CSSProperties
      }
    >
      {cue.target === "scroll" ? (
        <span className="landing-workflow-guide-scroll" />
      ) : (
        <>
          <span className="landing-workflow-guide-ring" />
          <span className="landing-workflow-guide-pointer" />
        </>
      )}
    </div>
  );
}
