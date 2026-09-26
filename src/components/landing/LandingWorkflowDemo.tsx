"use client";

import { useMemo } from "react";
import { LandingWorkflowCell } from "@/components/landing/LandingWorkflowCell";
import {
  DEMO_MACHINE,
  DEMO_PLANT,
  DEMO_QUOTE_NUMBER,
  WORKFLOW_DEMO_PART,
  WORKFLOW_DEMO_QTY,
  demoPlayhead,
  workflowSpinYaw,
  workflowStep,
} from "@/lib/ui/landing-demo";

const BEATS: readonly {
  step: ReturnType<typeof workflowStep>;
  title: string;
  detail: string;
}[] = [
  {
    step: "model",
    title: "Open the cell",
    detail: "Your published schematic — the same model the floor runs.",
  },
  {
    step: "spin",
    title: "Orbit the machine",
    detail: "Scroll to spin the cell and find the wear part.",
  },
  {
    step: "pick",
    title: "Tap the roller",
    detail: `${WORKFLOW_DEMO_PART} highlights on the infeed — one tap, no BOM hunt.`,
  },
  {
    step: "quote",
    title: "Add to quote",
    detail: "Lines stay on the machine. Notes ride along for your OEM partner.",
  },
  {
    step: "submit",
    title: "Request quote",
    detail: "Send it — staff picks up in the same workspace.",
  },
];

function beatForStep(step: ReturnType<typeof workflowStep>) {
  return BEATS.find((beat) => beat.step === step) ?? BEATS[0];
}

export function LandingWorkflowDemo({
  progress,
  reduceMotion,
}: {
  progress: number;
  reduceMotion: boolean;
}) {
  const playhead = demoPlayhead(reduceMotion, progress);
  const step = workflowStep(playhead);
  const beat = beatForStep(step);
  const spinYaw = useMemo(() => workflowSpinYaw(playhead), [playhead]);
  const sheetOpen = step === "quote" || step === "submit";
  const submitted = step === "submit";

  return (
    <div className="landing-demo-stage landing-workflow" data-demo="workflow" data-step={step}>
      <header className="landing-workflow-head">
        <div>
          <p className="landing-demo-kicker">{DEMO_PLANT}</p>
          <h3 className="landing-demo-title">{DEMO_MACHINE}</h3>
          <p className="landing-demo-meta">Scroll the story — model to quote request.</p>
        </div>
        <ol className="landing-workflow-steps" aria-label="Workflow steps">
          {BEATS.map((item, index) => {
            const active = item.step === step;
            const done = BEATS.findIndex((b) => b.step === step) > index;
            return (
              <li
                key={item.step}
                className={[
                  "landing-workflow-step",
                  active ? "is-active" : "",
                  done ? "is-done" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="landing-workflow-step-dot" aria-hidden="true" />
                <span className="landing-workflow-step-label">{item.title}</span>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="landing-workflow-stage">
        <div className="landing-workflow-model">
          <LandingWorkflowCell spinYaw={spinYaw} />
          <div
            className={[
              "landing-workflow-hotspot",
              step === "pick" || step === "quote" || step === "submit" ? "is-on" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            aria-hidden="true"
          >
            <span className="landing-workflow-hotspot-ring" />
            <span className="landing-workflow-hotspot-label">{WORKFLOW_DEMO_PART}</span>
          </div>
          <div
            className={step === "pick" ? "landing-workflow-cursor is-on" : "landing-workflow-cursor"}
            aria-hidden="true"
          />
          <p className="landing-workflow-caption">
            <span className="landing-workflow-caption-title">{beat.title}</span>
            <span className="landing-workflow-caption-detail">{beat.detail}</span>
          </p>
        </div>

        <aside
          className={[
            "landing-workflow-sheet",
            sheetOpen ? "is-open" : "",
            submitted ? "is-sent" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          aria-label="Quote request"
        >
          <div className="landing-workflow-sheet-handle" aria-hidden="true" />
          <div className="landing-workflow-sheet-head">
            <h4 className="landing-workflow-sheet-title">Quote</h4>
            <p className="landing-workflow-sheet-sub">
              {submitted ? "Request sent" : sheetOpen ? `${WORKFLOW_DEMO_QTY} items` : "Tap a part on the machine."}
            </p>
          </div>

          {submitted ? (
            <div className="landing-workflow-sheet-success" role="status">
              <p className="landing-workflow-sheet-success-title">Quote request received</p>
              <p className="landing-workflow-sheet-success-meta">
                Quote {DEMO_QUOTE_NUMBER} · {WORKFLOW_DEMO_PART} × {WORKFLOW_DEMO_QTY}
              </p>
            </div>
          ) : sheetOpen ? (
            <ul className="landing-workflow-lines">
              <li className="landing-workflow-line is-highlight">
                <div>
                  <p className="landing-workflow-line-name">{WORKFLOW_DEMO_PART}</p>
                  <p className="landing-workflow-line-meta">Infeed drive roller · {DEMO_MACHINE}</p>
                </div>
                <span className="landing-workflow-line-qty">×{WORKFLOW_DEMO_QTY}</span>
              </li>
            </ul>
          ) : (
            <p className="landing-workflow-sheet-empty">Pick a part on the model to start a quote.</p>
          )}

          <button
            type="button"
            className={[
              "landing-workflow-submit",
              submitted ? "is-sent" : sheetOpen ? "is-ready" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            tabIndex={-1}
            aria-hidden="true"
          >
            {submitted ? "Sent" : "Request quote"}
          </button>
        </aside>
      </div>
    </div>
  );
}
