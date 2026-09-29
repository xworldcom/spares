"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { QuoteStatusChip } from "@/components/quote/QuoteStatusChip";
import { QuoteStatusStrip } from "@/components/quote/QuoteStatusStrip";
import { LandingWorkflowCell } from "@/components/landing/LandingWorkflowCell";
import { initialsFromEmail } from "@/lib/ui/initials";
import { LandingWorkflowGuide } from "@/components/landing/LandingWorkflowGuide";
import {
  DEMO_MACHINE,
  DEMO_OTHER_LABEL,
  DEMO_QUOTE_NUMBER,
  WORKFLOW_DEMO_PART,
  WORKFLOW_DEMO_PART_NAME,
  WORKFLOW_DEMO_QTY,
  demoApplyAtVisibility,
  demoPlayhead,
  demoRowHidden,
  reduceDemoFrame,
  workflowGuideCue,
  workflowHandoffMix,
  workflowHighlightPartId,
  workflowHubVisible,
  workflowQuoteChatPlayhead,
  workflowScrubPlayhead,
  workflowSpinYaw,
  workflowStep,
  type WorkflowStageAnchors,
  type WorkflowStagePoint,
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
  const linearProgress = demoPlayhead(reduceMotion, progress);
  const playhead = useMemo(
    () => (reduceMotion ? linearProgress : workflowScrubPlayhead(linearProgress)),
    [linearProgress, reduceMotion],
  );
  const step = workflowStep(playhead);
  const spinYaw = useMemo(() => workflowSpinYaw(playhead), [playhead]);
  const handoff = reduceMotion && step === "handoff" ? 1 : workflowHandoffMix(playhead);
  const chatPlayhead = useMemo(() => workflowQuoteChatPlayhead(playhead), [playhead]);
  const quoteFrame = useMemo(() => reduceDemoFrame("quote", chatPlayhead), [chatPlayhead]);
  const completeThread = useMemo(() => reduceDemoFrame("quote", 1), []);
  const liveById = useMemo(
    () => new Map(quoteFrame.rows.map((row) => [row.id, row])),
    [quoteFrame.rows],
  );
  const threadRows = useMemo(
    () => completeThread.rows.map((row) => liveById.get(row.id) ?? row),
    [completeThread.rows, liveById],
  );
  const enteringId = reduceMotion ? null : quoteFrame.appearingId;
  const threadRef = useRef<HTMLOListElement>(null);

  useLayoutEffect(() => {
    if (reduceMotion) {
      return;
    }
    const thread = threadRef.current;
    if (!thread) {
      return;
    }
    demoApplyAtVisibility(thread.querySelectorAll<HTMLElement>("[data-demo-at]"), chatPlayhead);
  }, [chatPlayhead, reduceMotion, handoff]);

  const showHotspot = step === "select";
  const showPartSheet = step === "select";
  const showQuoteSheet = step === "quote" || step === "send";
  const showThreadView = handoff > 0.02;
  const showHubChrome = workflowHubVisible(step);
  const highlightPartId = workflowHighlightPartId(step);
  const guideTarget = workflowGuideCue(playhead).target;
  const anchorRef = useRef<WorkflowStageAnchors>({ machine: null, part: null });
  const [machineAnchor, setMachineAnchor] = useState<WorkflowStagePoint | null>(null);
  const [partAnchor, setPartAnchor] = useState<WorkflowStagePoint | null>(null);
  const onAnchors = useCallback((next: WorkflowStageAnchors) => {
    const same = (a: WorkflowStagePoint | null, b: WorkflowStagePoint | null) => {
      if (!a || !b) {
        return a === b;
      }
      return Math.abs(a.x - b.x) < 0.4 && Math.abs(a.y - b.y) < 0.4;
    };
    const prev = anchorRef.current;
    if (same(prev.machine, next.machine) && same(prev.part, next.part)) {
      return;
    }
    anchorRef.current = next;
    setMachineAnchor(next.machine);
    setPartAnchor(next.part);
  }, []);

  return (
    <div
      className="landing-demo-stage landing-workflow"
      data-demo="workflow"
      data-step={step}
      style={{ "--wf-handoff": handoff } as CSSProperties}
    >
      {showHubChrome ? (
        <header className="landing-workflow-hub">
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
      ) : null}

      <div
        className={[
          "landing-workflow-stage",
          handoff > 0.55 ? "is-handoff" : "",
          showQuoteSheet ? "is-quote-focus" : "",
          reduceMotion ? "is-reduced" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <LandingWorkflowGuide playhead={playhead} reduceMotion={reduceMotion} />
        <div className="landing-workflow-model-panel" aria-hidden={showThreadView && handoff > 0.85}>
          <div className="landing-workflow-model">
            <LandingWorkflowCell
              spinYaw={spinYaw}
              highlightPartId={highlightPartId}
              onAnchors={onAnchors}
            />
            {machineAnchor ? (
              <>
                <span
                  className="landing-workflow-anchor"
                  data-guide-target="scroll"
                  style={{ left: `${machineAnchor.x}%`, top: `${machineAnchor.y}%` }}
                />
                <span
                  className="landing-workflow-anchor"
                  data-guide-target="orbit"
                  style={{ left: `${machineAnchor.x}%`, top: `${machineAnchor.y}%` }}
                />
              </>
            ) : null}
            {showHotspot && partAnchor ? (
              <div
                className="landing-workflow-hotspot is-on"
                aria-hidden="true"
                style={{ left: `${partAnchor.x}%`, top: `${partAnchor.y}%` }}
              >
                {guideTarget === "hotspot" ? (
                  <span className="landing-workflow-hotspot-ring" data-guide-target="hotspot" />
                ) : null}
                <span className="landing-workflow-hotspot-label">{WORKFLOW_DEMO_PART}</span>
              </div>
            ) : null}
          </div>

          {showPartSheet ? (
            <div className="landing-workflow-part-sheet viewer-chrome-chip" data-part-sheet="">
              <div className="landing-workflow-part-sheet-inner">
                <div className="landing-workflow-part-copy">
                  <p className="landing-workflow-part-name">{WORKFLOW_DEMO_PART_NAME}</p>
                  <p className="landing-workflow-part-id">{WORKFLOW_DEMO_PART}</p>
                  <p className="landing-workflow-part-meta">Infeed · BOM qty 2</p>
                </div>
                <span className="landing-workflow-add" data-guide-target="add">
                  Add to quote
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="landing-workflow-side" aria-hidden={showThreadView && handoff > 0.4}>
          {showQuoteSheet ? (
            <div className="landing-workflow-quote-sheet">
              <div className="landing-workflow-quote-sheet-handle" aria-hidden="true" />
              <div className="landing-workflow-quote-head">
                <h4 className="landing-workflow-quote-title">Quote</h4>
                <p className="landing-workflow-quote-sub">
                  <span className="landing-workflow-quote-count">{WORKFLOW_DEMO_QTY}</span>
                  {WORKFLOW_DEMO_QTY === 1 ? " item" : " items"}
                </p>
              </div>
              <ul className="landing-workflow-quote-lines">
                <li className="landing-workflow-quote-line tray-line" data-guide-target="quote">
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
              <span className="landing-workflow-request-quote" data-guide-target="request">
                Request quote
              </span>
            </div>
          ) : null}
        </div>

        <div
          className={["landing-workflow-request", showThreadView ? "is-visible" : ""]
            .filter(Boolean)
            .join(" ")}
          aria-hidden={!showThreadView}
        >
          <header className="landing-workflow-request-head">
            <div className="landing-workflow-request-titleblock">
              <h3 className="landing-demo-title landing-workflow-request-quote-id">
                Quote {DEMO_QUOTE_NUMBER}
              </h3>
              <p className="landing-demo-meta landing-workflow-request-context">
                {WORKFLOW_DEMO_PART_NAME} · {DEMO_MACHINE}
              </p>
            </div>
            <QuoteStatusChip status={quoteFrame.quoteStatus} current />
          </header>
          <QuoteStatusStrip status={quoteFrame.quoteStatus} editable={false} role="customer" />
          <ol
            ref={threadRef}
            className="imsg-thread landing-workflow-thread"
            aria-live={reduceMotion ? "off" : "polite"}
            data-scrubbed=""
          >
            {threadRows.map((row) => {
              if (row.kind === "system") {
                return (
                  <li
                    key={row.id}
                    data-demo-at={row.at}
                    hidden={demoRowHidden(row.at, chatPlayhead)}
                    className={enteringId === row.id ? "imsg-system imsg-enter" : "imsg-system"}
                  >
                    <span className="imsg-chip">{row.text}</span>
                  </li>
                );
              }

              const own = row.lane === "own";
              return (
                <li
                  key={row.id}
                  data-demo-at={row.at}
                  hidden={demoRowHidden(row.at, chatPlayhead)}
                  data-stacked={row.stacked ? "true" : "false"}
                  data-end={row.lastInStack ? "true" : "false"}
                  className={[
                    "imsg-row",
                    own ? "imsg-own" : "imsg-other",
                    enteringId === row.id ? "imsg-enter" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {own ? null : row.lastInStack ? (
                    <span className="imsg-avatar" aria-hidden="true">
                      {initialsFromEmail(row.actorEmail)}
                    </span>
                  ) : (
                    <span className="imsg-avatar-spacer" aria-hidden="true" />
                  )}
                  <div className="imsg-stack">
                    {row.stacked ? null : (
                      <p className="imsg-meta">{own ? "You" : DEMO_OTHER_LABEL}</p>
                    )}
                    <div className="imsg-bubble">
                      <p className="imsg-text">{row.text}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
