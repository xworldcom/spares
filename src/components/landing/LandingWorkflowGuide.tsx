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
  const [point, setPoint] = useState({ x: cue.x, y: cue.y });

  useLayoutEffect(() => {
    if (!cue.target) {
      return;
    }

    let frame = 0;
    const measure = () => {
      const guide = nodeRef.current;
      const stage = guide?.closest(".landing-workflow-stage");
      const target = stage?.querySelector(workflowGuideTargetSelector(cue.target));
      if (stage instanceof HTMLElement && target instanceof HTMLElement) {
        const next = workflowGuideStagePoint(
          stage.getBoundingClientRect(),
          target.getBoundingClientRect(),
        );
        if (next) {
          setPoint((prev) =>
            Math.abs(prev.x - next.x) < 0.2 && Math.abs(prev.y - next.y) < 0.2 ? prev : next,
          );
          frame = window.requestAnimationFrame(measure);
          return;
        }
      }
      setPoint({ x: cue.x, y: cue.y });
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
