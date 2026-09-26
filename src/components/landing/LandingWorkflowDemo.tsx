"use client";

import { useMemo, type CSSProperties } from "react";
import { QuoteStatusChip } from "@/components/quote/QuoteStatusChip";
import { QuoteStatusStrip } from "@/components/quote/QuoteStatusStrip";
import { LandingWorkflowCell } from "@/components/landing/LandingWorkflowCell";
import {
  DEMO_MACHINE,
  DEMO_PLANT,
  DEMO_QUOTE_NUMBER,
  WORKFLOW_DEMO_PART,
  WORKFLOW_DEMO_PART_NAME,
  WORKFLOW_DEMO_QTY,
  demoPlayhead,
  workflowHandoffMix,
  workflowSpinYaw,
  workflowStep,
} from "@/lib/ui/landing-demo";

const HUB_TABS = [
  { id: "parts", label: "Parts", active: true },
  { id: "quotes", label: "Quotes", active: false },
  { id: "tickets", label: "Tickets", active: false },
  { id: "manuals", label: "Manuals", active: false },
  { id: "service", label: "Service reports", active: false },
] as const;

export function LandingWorkflowDemo({
  progress,
  reduceMotion,
}: {
  progress: number;
  reduceMotion: boolean;
}) {
  const playhead = demoPlayhead(reduceMotion, progress);
  const step = workflowStep(playhead);
  const spinYaw = useMemo(() => workflowSpinYaw(playhead), [playhead]);
  const handoff = reduceMotion && step === "handoff" ? 1 : workflowHandoffMix(playhead);

  const showHotspot = step === "select";
  const showPartSheet = step === "select";
  const showQuoteSheet = step === "quote" || step === "send";
  const showRequestView = handoff > 0.02;

  return (
    <div
      className="landing-demo-stage landing-workflow"
      data-demo="workflow"
      data-step={step}
      style={{ "--wf-handoff": handoff } as CSSProperties}
    >
      <header className="landing-workflow-hub">
        <div className="landing-workflow-hub-title">
          <p className="landing-demo-kicker">{DEMO_PLANT}</p>
          <h3 className="landing-demo-title">{DEMO_MACHINE}</h3>
        </div>
        <nav className="landing-workflow-tabs" aria-label="Machine">
          {HUB_TABS.map((tab) => (
            <span
              key={tab.id}
              className={tab.active ? "landing-workflow-tab is-active" : "landing-workflow-tab"}
              aria-current={tab.active ? "page" : undefined}
            >
              {tab.label}
            </span>
          ))}
        </nav>
      </header>

      <div
        className={[
          "landing-workflow-stage",
          handoff > 0.55 ? "is-handoff" : "",
          reduceMotion ? "is-reduced" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="landing-workflow-model-panel" aria-hidden={showRequestView && handoff > 0.85}>
          <div className="landing-workflow-model">
            <LandingWorkflowCell spinYaw={spinYaw} />
            <div
              className={["landing-workflow-hotspot", showHotspot ? "is-on" : ""]
                .filter(Boolean)
                .join(" ")}
              aria-hidden="true"
            >
              <span className="landing-workflow-hotspot-ring" />
              <span className="landing-workflow-hotspot-label">{WORKFLOW_DEMO_PART}</span>
            </div>
          </div>

          {showPartSheet ? (
            <div className="landing-workflow-part-sheet viewer-chrome-chip" data-part-sheet="">
              <div className="landing-workflow-part-sheet-inner">
                <div className="landing-workflow-part-copy">
                  <p className="landing-workflow-part-name">{WORKFLOW_DEMO_PART_NAME}</p>
                  <p className="landing-workflow-part-id">{WORKFLOW_DEMO_PART}</p>
                  <p className="landing-workflow-part-meta">Infeed · BOM qty 2</p>
                </div>
                <button type="button" className="btn-accent landing-workflow-add" tabIndex={-1}>
                  Add to quote
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="landing-workflow-side" aria-hidden={showRequestView && handoff > 0.4}>
          {showQuoteSheet ? (
            <div
              className={[
                "landing-workflow-quote-sheet",
                step === "send" ? "is-send" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="landing-workflow-quote-sheet-handle" aria-hidden="true" />
              <div className="landing-workflow-quote-head">
                <h4 className="landing-workflow-quote-title">Quote</h4>
                <p className="landing-workflow-quote-sub">
                  <span className="landing-workflow-quote-count">{WORKFLOW_DEMO_QTY}</span>
                  {WORKFLOW_DEMO_QTY === 1 ? " item" : " items"}
                </p>
              </div>
              <ul className="landing-workflow-quote-lines">
                <li className="landing-workflow-quote-line tray-line">
                  <div className="landing-workflow-quote-line-main">
                    <span className="landing-workflow-quote-thumb" aria-hidden="true">3D</span>
                    <div>
                      <p className="landing-workflow-quote-line-name">{WORKFLOW_DEMO_PART_NAME}</p>
                      <p className="landing-workflow-quote-line-id">{WORKFLOW_DEMO_PART}</p>
                      <p className="landing-workflow-quote-line-meta">{DEMO_MACHINE}</p>
                    </div>
                  </div>
                  <div className="landing-workflow-quote-qty" aria-label="Quantity">
                    <span className="landing-workflow-quote-qty-num">{WORKFLOW_DEMO_QTY}</span>
                  </div>
                </li>
              </ul>
              <button
                type="button"
                className="landing-workflow-request-quote btn-accent"
                tabIndex={-1}
              >
                Request quote
              </button>
            </div>
          ) : null}
        </div>

        <div
          className={["landing-workflow-request", showRequestView ? "is-visible" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-hidden={!showRequestView}
        >
          <header className="landing-workflow-request-head">
            <div>
              <p className="landing-demo-kicker">{DEMO_PLANT}</p>
              <h3 className="landing-demo-title">Quote {DEMO_QUOTE_NUMBER}</h3>
              <p className="landing-demo-meta">
                {WORKFLOW_DEMO_PART_NAME} · {DEMO_MACHINE}
              </p>
            </div>
            <QuoteStatusChip status="requested" current />
          </header>
          <QuoteStatusStrip status="requested" editable={false} role="customer" />
          <p className="landing-workflow-request-status" role="status">
            Quote request received. Staff will review pricing and lead time.
          </p>
          <ul className="landing-workflow-request-lines">
            <li>
              <span className="landing-workflow-request-line-id">{WORKFLOW_DEMO_PART}</span>
              <span className="landing-workflow-request-line-qty">×{WORKFLOW_DEMO_QTY}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
