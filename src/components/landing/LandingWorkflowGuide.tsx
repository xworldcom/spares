"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import {
  workflowGuideCue,
  workflowGuideStagePoint,
  workflowGuideTargetSelector,
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

function LandingWorkflowGuideLive({ playhead }: { playhead: number }) {
  const cue = workflowGuideCue(playhead);
  const nodeRef = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState<{ x: number; y: number; ready: boolean }>({
    x: cue.x,
    y: cue.y,
    ready: false,
  });

  useLayoutEffect(() => {
    if (!cue.target) {
      setPoint((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }

    let frame = 0;
    const measure = () => {
      const guide = nodeRef.current;
      const stage = guide?.closest(".landing-workflow-stage");
      const target = stage?.querySelector(workflowGuideTargetSelector(cue.target));
      const next =
        stage instanceof HTMLElement && target instanceof HTMLElement
          ? workflowGuideStagePoint(stage.getBoundingClientRect(), target.getBoundingClientRect())
          : null;
      if (!next) {
        setPoint((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      } else {
        setPoint((prev) =>
          prev.ready && Math.abs(prev.x - next.x) < 0.15 && Math.abs(prev.y - next.y) < 0.15
            ? prev
            : { x: next.x, y: next.y, ready: true },
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
  }, [cue.target, cue.x, cue.y]);

  if (!cue.target) {
    return null;
  }

  const targetClass =
    cue.target === "scroll" ? "landing-workflow-guide is-scroll" : "landing-workflow-guide";

  return (
    <div
      ref={nodeRef}
      className={targetClass}
      data-guide={cue.target}
      aria-hidden="true"
      style={
        {
          "--wf-guide-x": `${point.x}%`,
          "--wf-guide-y": `${point.y}%`,
          visibility: point.ready ? "visible" : "hidden",
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
