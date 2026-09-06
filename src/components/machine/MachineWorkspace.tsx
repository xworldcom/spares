"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PartsBom } from "@/components/machine/PartsBom";
import { SelectedPartSheet } from "@/components/machine/SelectedPartSheet";
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
import { shouldAutoDismissPartSheet } from "@/lib/ui/part-sheet";
import { DESKTOP_MQ } from "@/lib/ui/breakpoints";

const VIEWER_STAGE = "#1c232c";

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
  const [view, setView] = useState<"model" | "list">("model");
  const [desktop, setDesktop] = useState(false);
  const { chromeRef, fullscreen, overlay, enter, exit } = useViewerFullscreen();
  const captureThumb = useRef<(partId: string) => string | null>(() => null);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MQ);
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

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
            className={`absolute inset-0 ${view === "list" ? "invisible" : ""}`}
          />
        ) : (
          <EmptyState
            title="No model"
            message="This machine pack does not have a GLB or GLTF file to display."
          />
        )}
        {view === "list" ? (
          <section
            data-parts-bom=""
            className="absolute inset-0 z-[15] overflow-y-auto bg-[#f4f5f7] px-4 pb-8"
            style={{ paddingTop: "4.35rem" }}
          >
            <p className="mb-3 truncate text-[15px] font-semibold text-neutral-950">
              {machine.name}
            </p>
            <PartsBom
              parts={joinedParts}
              selectedPartId={selectedPart?.id ?? null}
              onSelect={(part) => {
                setSelectedPart(part);
                setView("model");
              }}
              showAdd={isCustomer}
              onAdd={addPart}
              searchable
            />
            {showUnmatched && (machine.unmatched?.length ?? 0) > 0 ? (
              <p className="spares-muted mt-3 text-sm">
                {machine.unmatched?.length} extra mesh
                {(machine.unmatched?.length ?? 0) === 1 ? "" : "es"} in the
                model are not on this list.
              </p>
            ) : null}
          </section>
        ) : null}
        {view === "model" ? (
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
        ) : null}
        {isCustomer && (!desktop || fullscreen) ? tray : null}
        <div
          aria-hidden="true"
          className="viewer-chrome-shade pointer-events-none absolute inset-x-0 top-0 z-10 h-20"
        />
        <div className="absolute top-3 right-3 left-3 z-20 flex min-w-0 items-center gap-2">
          <div className="viewer-chrome-chip flex h-11 shrink-0 items-center rounded-full p-1">
            <button
              type="button"
              onClick={() => setView("model")}
              className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold ${
                view === "model" ? "btn-primary" : "text-neutral-600"
              }`}
            >
              3D
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold ${
                view === "list" ? "btn-primary" : "text-neutral-600"
              }`}
            >
              List
            </button>
          </div>
          {view === "model" ? (
            <label className="viewer-chrome-chip flex min-h-11 min-w-0 flex-1 items-center gap-2 px-3">
              <span className="hidden shrink-0 text-[13px] font-medium tracking-wide sm:inline">
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
          ) : (
            <div className="min-w-0 flex-1" />
          )}
          {view === "model" && needsReset ? (
            <button
              type="button"
              data-show-all=""
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.preventDefault();
                showAll();
              }}
              onClick={showAll}
              className="viewer-chrome-chip inline-flex h-11 shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold"
            >
              Show all
            </button>
          ) : null}
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
          {isCustomer && !fullscreen && !trayOpen && quoteChip ? (
            <button
              type="button"
              data-quote-tray=""
              onPointerDown={(event) => {
                if (event.button !== 0) {
                  return;
                }
                event.preventDefault();
                setTrayOpen(true);
              }}
              onClick={() => setTrayOpen(true)}
              className="viewer-chrome-chip inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold"
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
            className="viewer-chrome-chip relative z-40 hidden h-11 w-11 shrink-0 items-center justify-center rounded-full lg:inline-flex"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? (
              <span className="text-2xl leading-none">×</span>
            ) : (
              <ExpandIcon />
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="machine-stage">
      <h1 className="sr-only">{machine.name}</h1>

      <div
        className="machine-stage-grid"
        data-tray={
          (!isCustomer && desktop) || (isCustomer && trayOpen && !fullscreen)
            ? "open"
            : "closed"
        }
      >
        {viewerBlock}
        {isCustomer && desktop && !fullscreen ? tray : null}
        {isCustomer ? null : (
          <div className="quote-tray-dock is-open rounded-[28px] bg-white p-5 text-sm leading-relaxed text-neutral-500">
            Customers request quotes from this page. Staff inspect the join
            here.
          </div>
        )}
      </div>
    </div>
  );
}
