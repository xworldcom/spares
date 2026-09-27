"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  workflowGuideCue,
  workflowGuideStagePoint,
  workflowGuideTargetSelector,
  type WorkflowGuideTarget,
} from "@/lib/ui/landing-demo";

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

  return <LandingWorkflowGuideLive playhead={playhead} />;
}

type GuidePoint = {
  x: number;
  y: number;
  ready: boolean;
  target: WorkflowGuideTarget | null;
};

function LandingWorkflowGuideLive({ playhead }: { playhead: number }) {
  const cue = workflowGuideCue(playhead);
  const nodeRef = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState<GuidePoint>({
    x: cue.x,
    y: cue.y,
    ready: false,
    target: null,
  });

  useLayoutEffect(() => {
    if (!cue.target) {
      setPoint((prev) => (prev.ready || prev.target ? { ...prev, ready: false, target: null } : prev));
      return;
    }

    const targetName = cue.target;
    let frame = 0;
    const measure = () => {
      const guide = nodeRef.current;
      const stage = guide?.closest(".landing-workflow-stage");
      const target = stage?.querySelector(workflowGuideTargetSelector(targetName));
      const next =
        stage instanceof HTMLElement && target instanceof HTMLElement
          ? workflowGuideStagePoint(stage.getBoundingClientRect(), target.getBoundingClientRect())
          : null;
      if (!next) {
        setPoint((prev) =>
          prev.ready || prev.target !== targetName
            ? { x: prev.x, y: prev.y, ready: false, target: targetName }
            : prev,
        );
      } else {
        setPoint((prev) =>
          prev.ready &&
          prev.target === targetName &&
          Math.abs(prev.x - next.x) < 0.15 &&
          Math.abs(prev.y - next.y) < 0.15
            ? prev
            : { x: next.x, y: next.y, ready: true, target: targetName },
        );
      }
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [cue.target]);

  if (!cue.target) {
    return null;
  }

  const shown = point.ready && point.target === cue.target;
  const targetClass =
    cue.target === "scroll" ? "landing-workflow-guide is-scroll" : "landing-workflow-guide";

  return (
    <div
      ref={nodeRef}
      className={targetClass}
      data-guide={shown ? cue.target : undefined}
      aria-hidden="true"
      style={
        {
          "--wf-guide-x": `${point.x}%`,
          "--wf-guide-y": `${point.y}%`,
          visibility: shown ? "visible" : "hidden",
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
