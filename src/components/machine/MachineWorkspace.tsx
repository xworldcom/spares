"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PartsBom } from "@/components/machine/PartsBom";
import { SelectedPartSheet } from "@/components/machine/SelectedPartSheet";
import { UnmatchedMeshes } from "@/components/machine/UnmatchedMeshes";
import { useViewerFullscreen } from "@/components/machine/useViewerFullscreen";
import { QuoteTray, SHEET_EASE_MS, type TrayLine } from "@/components/quote/QuoteTray";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { PartPicker } from "@/components/viewer";
import type { ViewerPart } from "@/components/viewer";
import { viewerNeedsReset } from "@/components/viewer/assemblyView";
import { getMachine, machineFileSrc } from "@/lib/api/machines";
import { errorMessage, isNotFound, isUnauthorized } from "@/lib/api/errors";
import type { MachineDetail, Part } from "@/lib/api/types";
import { siteLabel } from "@/lib/access";
import { shouldAutoDismissPartSheet } from "@/lib/ui/part-sheet";

const VIEWER_STAGE = "#1c232c";
const DESKTOP_STAGE = "(min-width: 1024px) and (min-height: 840px)";

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="currentColor"
        d="M4 10V4h6v2H6v4H4zm10-6h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 4v-4h2v6h-6v-2h4z"
      />
    </svg>
  );
}

export function MachineWorkspace({ machineId }: { machineId: string }) {
  const { user } = useAuth();
  const isCustomer = user?.role === "customer";
  const [machine, setMachine] = useState<MachineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [explode, setExplode] = useState(0);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [lines, setLines] = useState<TrayLine[]>([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const [quoteChip, setQuoteChip] = useState(true);
  const [held, setHeld] = useState(false);
  const [bomOpen, setBomOpen] = useState(false);
  const { chromeRef, fullscreen, overlay, enter, exit } = useViewerFullscreen();
  const captureThumb = useRef<(partId: string) => string | null>(() => null);

  useEffect(() => {
    if (!isCustomer || typeof window === "undefined") {
      return;
    }
    setTrayOpen(true);
  }, [isCustomer, machineId]);

  useEffect(() => {
    if (trayOpen) {
      setQuoteChip(false);
      return;
    }
    const timer = window.setTimeout(() => setQuoteChip(true), SHEET_EASE_MS);
    return () => window.clearTimeout(timer);
  }, [trayOpen]);

  useEffect(() => {
    let cancelled = false;
    getMachine(machineId, user?.role)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setMachine(next);
        setSelectedPart(null);
        setLines([]);
        setHiddenIds([]);
        setIsolatedId(null);
        setExplode(0);
        setError(null);
        setNotFound(false);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setMachine(null);
        setSelectedPart(null);
        if (isUnauthorized(cause)) {
          setError("You are not signed in.");
          setNotFound(false);
        } else if (isNotFound(cause)) {
          setError(null);
          setNotFound(true);
        } else {
          setError(errorMessage(cause, "Failed to load this machine."));
          setNotFound(false);
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [machineId, reloadKey, user?.role]);

  useEffect(() => {
    if (!selectedPart) {
      return;
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-part-sheet]")) {
        return;
      }
      if (target.closest("[data-parts-bom]")) {
        return;
      }
      if (target.closest("[data-quote-tray]")) {
        return;
      }
      if (target.closest("canvas")) {
        return;
      }
      if (target.closest("[data-show-all]")) {
        return;
      }
      if (target.closest("[data-bug-report]")) {
        return;
      }
      setSelectedPart(null);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selectedPart]);

  const needsReset = viewerNeedsReset(explode, hiddenIds, isolatedId);
  const src = machine ? machineFileSrc(machine.id) : "";
  const joinedParts: ViewerPart[] = machine?.parts ?? [];
  const showUnmatched =
    user?.role === "staff" && machine?.unmatched !== undefined;
  const tray = useMemo(() => {
    if (!isCustomer) {
      return null;
    }
    return (
      <QuoteTray
        machineId={machineId}
        lines={lines}
        onQty={(partId, qty) => {
          setLines((current) =>
            current.map((line) =>
              line.part.id === partId ? { ...line, qty } : line,
            ),
          );
        }}
        onRemove={(partId) => {
          setLines((current) => current.filter((line) => line.part.id !== partId));
        }}
        onClear={() => setLines([])}
        open={trayOpen}
        onOpenChange={setTrayOpen}
      />
    );
  }, [isCustomer, lines, machineId, trayOpen]);

  if (loading) {
    return <LoadingState label="Loading machine…" />;
  }

  if (notFound) {
    return (
      <EmptyState
        title="Machine not found"
        message="This pack does not exist, or the API is not on this preview yet."
      />
    );
  }

  if (error || !machine) {
    return (
      <ErrorState
        title="Failed to load machine"
        message={error ?? "Unknown error"}
        onRetry={() => {
          setLoading(true);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  function showAll() {
    setExplode(0);
    setHiddenIds([]);
    setIsolatedId(null);
  }

  function hideSelected() {
    if (!selectedPart) {
      return;
    }
    setHiddenIds((current) =>
      current.includes(selectedPart.id) ? current : [...current, selectedPart.id],
    );
    if (isolatedId === selectedPart.id) {
      setIsolatedId(null);
    }
    if (shouldAutoDismissPartSheet("hide")) {
      setSelectedPart(null);
    }
  }

  function isolateSelected() {
    if (!selectedPart) {
      return;
    }
    setIsolatedId(selectedPart.id);
    setHiddenIds((current) => current.filter((id) => id !== selectedPart.id));
    if (shouldAutoDismissPartSheet("isolate")) {
      setSelectedPart(null);
    }
  }

  function addPart(part: Part) {
    const thumb = captureThumb.current(part.id) ?? undefined;
    setLines((current) => {
      if (current.some((line) => line.part.id === part.id)) {
        return current;
      }
      return [...current, { part, qty: 1, thumb }];
    });
    setTrayOpen(true);
    setBomOpen(false);
  }

  function addSelected() {
    if (!selectedPart) {
      return;
    }
    addPart(selectedPart);
    if (shouldAutoDismissPartSheet("add")) {
      setSelectedPart(null);
    }
  }

  const quoteCount = lines.reduce((sum, line) => sum + line.qty, 0);

  const viewerBlock = (
    <div
      ref={chromeRef}
      className={
        overlay
          ? "fixed inset-x-0 bottom-0 z-40 flex flex-col top-[var(--spares-header)]"
          : fullscreen
            ? "flex h-full min-h-0 flex-col"
            : "machine-viewer overflow-hidden sm:rounded-[28px]"
      }
      style={{ background: VIEWER_STAGE }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <div className="relative min-h-0 flex-1">
        {src ? (
          <PartPicker
            src={src}
            parts={joinedParts}
            selectedId={selectedPart?.id ?? null}
            explode={explode}
            hiddenIds={hiddenIds}
            isolatedId={isolatedId}
            onSelect={setSelectedPart}
            onLongPress={(part) => {
              setSelectedPart(part);
              setHeld(true);
              window.setTimeout(() => setHeld(false), 240);
            }}
            onCaptureReady={(capture) => {
              captureThumb.current = capture;
            }}
            className="absolute inset-0"
          />
        ) : (
          <EmptyState
            title="No model"
            message="This machine pack does not have a GLB or GLTF file to display."
          />
        )}
        <SelectedPartSheet
          part={selectedPart}
          isolated={Boolean(selectedPart && isolatedId === selectedPart.id)}
          onHide={hideSelected}
          onIsolate={isolateSelected}
          onAdd={isCustomer ? addSelected : undefined}
          onDismiss={() => setSelectedPart(null)}
          showAdd={isCustomer}
          held={held}
        />
        {isCustomer ? tray : null}
        <div
          aria-hidden="true"
          className="viewer-chrome-shade pointer-events-none absolute inset-x-0 top-0 z-10 h-36"
        />
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          {isCustomer && fullscreen ? (
            <QuoteTray
              machineId={machine.id}
              lines={lines}
              onQty={() => undefined}
              onRemove={() => undefined}
              onClear={() => undefined}
              fullscreen
              onExitToTray={() => {
                exit();
                setTrayOpen(true);
              }}
            />
          ) : null}
          {isCustomer && !trayOpen && quoteChip ? (
            <button
              type="button"
              data-quote-tray=""
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.preventDefault();
                if (fullscreen) {
                  exit();
                }
                setTrayOpen(true);
              }}
              onClick={() => {
                if (fullscreen) {
                  exit();
                }
                setTrayOpen(true);
              }}
              className="viewer-chrome-chip inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold"
              aria-label={`Show quote, ${quoteCount} ${quoteCount === 1 ? "item" : "items"}`}
            >
              Quote
              <span className="btn-accent inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-xs tabular-nums">
                {quoteCount}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            onPointerDown={(event) => {
              if (event.button !== 0) {
                return;
              }
              event.preventDefault();
              if (fullscreen) {
                exit();
              } else {
                enter();
              }
            }}
            onClick={() => {
              if (fullscreen) {
                exit();
              } else {
                enter();
              }
            }}
            className="viewer-chrome-chip relative z-40 inline-flex h-11 w-11 items-center justify-center rounded-full"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? (
              <span className="text-2xl leading-none">×</span>
            ) : (
              <ExpandIcon />
            )}
          </button>
        </div>
        <div className="absolute top-3 left-3 right-[7.25rem] z-20 flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              data-parts-bom=""
              onClick={() => setBomOpen(true)}
              className="viewer-chrome-chip inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold lg:hidden"
            >
              Parts
            </button>
            <div className="w-[6.6rem] shrink-0">
              <button
                type="button"
                data-show-all=""
                onPointerDown={(event) => {
                  if (!needsReset || event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  showAll();
                }}
                onClick={showAll}
                disabled={!needsReset}
                className={`viewer-chrome-chip inline-flex h-11 w-full items-center justify-center rounded-full px-3 text-sm font-semibold ${
                  needsReset ? "" : "invisible pointer-events-none"
                }`}
              >
                Show all
              </button>
            </div>
          </div>
          <label className="viewer-chrome-chip flex min-h-11 min-w-0 items-center gap-3 px-3">
            <span className="shrink-0 text-[13px] font-medium tracking-wide">
              Explode
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(explode * 100)}
              onChange={(event) => setExplode(Number(event.target.value) / 100)}
              className="explode-slider"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(explode * 100)}
              aria-label="Explode assembly"
            />
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="machine-stage">
      <div className="machine-title mb-3 min-w-0 shrink-0">
        <p className="spares-muted text-[11px] font-medium tracking-[0.16em] uppercase">
          Machine
        </p>
        <h1 className="mt-1 truncate text-[28px] leading-tight font-semibold tracking-tight">
          {machine.name}
        </h1>
        {machine.company && machine.siteName ? (
          <p className="spares-muted mt-1 truncate text-sm">
            {siteLabel({ company: machine.company, name: machine.siteName })}
          </p>
        ) : null}
      </div>
      <h1 className="sr-only">{machine.name}</h1>

      <div
        className="machine-stage-grid"
        data-tray={isCustomer && trayOpen && !fullscreen ? "open" : "closed"}
      >
        {viewerBlock}
        {isCustomer ? null : (
          <div className="quote-tray-dock is-open rounded-[28px] bg-white p-5 text-sm leading-relaxed text-neutral-500">
            Customers request quotes from this page. Staff inspect the join
            here.
          </div>
        )}
      </div>

      <section
        aria-labelledby="bom-heading"
        className="machine-bom mt-6 shrink-0 space-y-3"
      >
        <div>
          <h2 id="bom-heading" className="text-[13px] font-semibold tracking-tight text-neutral-950">
            Parts
          </h2>
        </div>
        <PartsBom
          parts={joinedParts}
          selectedPartId={selectedPart?.id ?? null}
          onSelect={setSelectedPart}
          showAdd={isCustomer}
          onAdd={addPart}
        />
      </section>

      {showUnmatched ? (
        <div className="machine-bom mt-6">
          <UnmatchedMeshes unmatched={machine.unmatched ?? []} />
        </div>
      ) : null}

      {bomOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close parts list"
            className="absolute inset-0 bg-black/35"
            onClick={() => setBomOpen(false)}
          />
          <div
            data-parts-bom=""
            className="absolute inset-x-0 bottom-0 max-h-[min(72dvh,36rem)] overflow-y-auto rounded-t-[28px] bg-white px-4 pt-4 shadow-[0_-12px_40px_rgba(0,0,0,0.18)]"
            style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[19px] font-semibold tracking-tight">Parts</h2>
              <button
                type="button"
                onClick={() => setBomOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#0b0d10]"
                aria-label="Close parts"
              >
                <span className="text-2xl leading-none">×</span>
              </button>
            </div>
            <PartsBom
              parts={joinedParts}
              selectedPartId={selectedPart?.id ?? null}
              onSelect={(part) => {
                setSelectedPart(part);
                setBomOpen(false);
              }}
              showAdd={isCustomer}
              onAdd={addPart}
            />
            {showUnmatched ? (
              <div className="mt-4">
                <UnmatchedMeshes unmatched={machine.unmatched ?? []} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
