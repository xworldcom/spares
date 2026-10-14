"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { PartsBom } from "@/components/machine/PartsBom";
import { SelectedPartSheet } from "@/components/machine/SelectedPartSheet";
import { StaffPartsReview } from "@/components/machine/StaffPartsReview";
import {
  useConversationDockStage,
  useDesktopStage,
  useQuoteConversationDockStage,
} from "@/components/machine/useDesktopStage";
import { useHydrated } from "@/lib/use-hydrated";
import { useResizableSplit } from "@/components/machine/useResizableSplit";
import { useViewerLayoutReady } from "@/components/machine/useViewerLayoutReady";
import { useViewerFullscreen } from "@/components/machine/useViewerFullscreen";
import { QuoteAddToast } from "@/components/quote/QuoteAddToast";
import { QuoteUndoToast } from "@/components/quote/QuoteUndoToast";
import { QuoteTray, SHEET_EASE_MS, type TrayLine } from "@/components/quote/QuoteTray";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { MachineWorkspaceSkeleton } from "./MachineWorkspaceSkeleton";
import { PartPicker } from "@/components/viewer";
import type { ViewerPart } from "@/components/viewer";
import Link from "next/link";
import { getMachine, updateMachinePart } from "@/lib/api/machines";
import { machineHasModel } from "@/lib/machines";
import { machineTabHref } from "@/lib/machine-context";
import { staffCatalogRows } from "@/lib/staff-catalog";
import {
  groupForPart,
  manualChildAsPart,
} from "@/lib/manual-sub-assembly";
import { errorMessage, isNotFound, isUnauthorized } from "@/lib/api/errors";
import type { MachineDetail, Part } from "@/lib/api/types";
import type { PartLifecycleInfo } from "@/types";
import { lookupPartLifecycle } from "@/lib/api/part-lifecycle";
import { playQuoteAddMotion } from "@/lib/ui/quote-feedback";
import {
  mergeHydratedTrayLines,
  quoteTrayNoteStorageKey,
  quoteTrayStorageKey,
  readPersistedTrayLines,
  readPersistedTrayNote,
  persistedToPart,
  resolveTrayLines,
  trayLineToPersisted,
  writePersistedTrayLines,
  writePersistedTrayNote,
} from "@/lib/ui/quote-tray-persist";
import {
  hiddenPartsStorageKey,
  pruneHiddenParts,
  readPersistedHiddenParts,
  writePersistedHiddenParts,
} from "@/lib/ui/hidden-parts-persist";
import { DocumentTitle } from "@/components/nav/DocumentTitle";
import { dismissPartSheetAfterQuoteAdd } from "@/lib/ui/quote-tray-open-policy";
import { shouldAutoDismissPartSheet } from "@/lib/ui/part-sheet";
import {
  shouldPinViewerOverlayFrame,
  viewerOverlayFramePx,
} from "@/lib/ui/viewer-pseudo-fullscreen";
import { staffPartLifecycleViewHref } from "@/lib/ui/part-lifecycle-url";

const VIEWER_STAGE = "#12161c";

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
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const isCustomer = user?.role === "customer";
  const [machine, setMachine] = useState<MachineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [explode, setExplode] = useState(0);
  const [viewerFitKey, setViewerFitKey] = useState(0);
  const [viewerResetKey, setViewerResetKey] = useState(0);
  const viewerLayoutRef = useRef<HTMLDivElement>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [isolatedId, setIsolatedId] = useState<string | null>(null);
  const [lines, setLines] = useState<TrayLine[]>([]);
  const [trayOpen, setTrayOpen] = useState(false);
  const [quoteChip, setQuoteChip] = useState(true);
  const [held, setHeld] = useState(false);
  const [view, setView] = useState<"model" | "list">("model");
  const [suggestedMesh, setSuggestedMesh] = useState<string | null>(null);
  const [savingPart, setSavingPart] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [addToast, setAddToast] = useState<string | null>(null);
  const [undoRemove, setUndoRemove] = useState<TrayLine | null>(null);
  const addToastTimer = useRef<number | null>(null);
  const undoRemoveTimer = useRef<number | null>(null);
  const undoRemoveRef = useRef<TrayLine | null>(null);
  const UNDO_REMOVE_MS = 12_000;
  const trayPersistRef = useRef({
    storageKey: null as string | null,
    linesKey: null as string | null,
  });
  const { chromeRef, fullscreen, overlay, enter, exit } = useViewerFullscreen();
  const [overlayFrame, setOverlayFrame] = useState<{ topPx: number; heightPx: number } | null>(
    null,
  );
  const desktopStage = useDesktopStage();
  const conversationDock = useConversationDockStage();
  const customerTrayDock = useQuoteConversationDockStage();
  const hydrated = useHydrated();
  const viewerLayoutReady = useViewerLayoutReady();
  const staffSplit = useResizableSplit(!isCustomer && desktopStage);
  const [lifecycleById, setLifecycleById] = useState<Record<string, PartLifecycleInfo>>({});
  const lifecycleAsked = useRef(new Set<string>());
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);
  const [linesKey, setLinesKey] = useState<string | null>(null);
  const trayStorageKey =
    isCustomer && user?.tenantId
      ? quoteTrayStorageKey(user.tenantId, machineId)
      : null;
  const trayNoteStorageKey =
    isCustomer && user?.tenantId
      ? quoteTrayNoteStorageKey(user.tenantId, machineId)
      : null;
  const [trayNote, setTrayNote] = useState("");
  const customerTrayInViewer = isCustomer && !customerTrayDock;

  useEffect(() => {
    const root = document.documentElement;
    if (isCustomer && fullscreen && overlay) {
      root.classList.add("viewer-immersive-fs");
    } else {
      root.classList.remove("viewer-immersive-fs");
    }
    return () => {
      root.classList.remove("viewer-immersive-fs");
    };
  }, [fullscreen, overlay, isCustomer]);

  useEffect(() => {
    if (!overlay || !shouldPinViewerOverlayFrame()) {
      setOverlayFrame(null);
      return;
    }
    function sync() {
      setOverlayFrame(viewerOverlayFramePx());
    }
    sync();
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    return () => {
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [overlay]);

  const trayPickSeed =
    isCustomer && selectedPart
      ? { id: selectedPart.id, name: selectedPart.name }
      : null;
  const staffSplitView = !isCustomer && desktopStage;
  const showViewToggle = !staffSplitView;
  const viewerMountReady =
    hydrated &&
    viewerLayoutReady &&
    (!staffSplitView || staffSplit.ready);
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
        setIsolatedId(null);
        setExplode(0);
        setSuggestedMesh(null);
        setSaveError(null);
        setError(null);
        setNotFound(false);
        setView("model");
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
    const partKey = searchParams.get("part")?.trim();
    if (!partKey || !machine) {
      return;
    }
    const needle = partKey.toLowerCase();
    const match =
      machine.parts.find((part) => part.id.toLowerCase() === needle) ??
      machine.parts.find((part) => part.id.toLowerCase().includes(needle));
    if (match) {
      setSelectedPart(match);
      setView("model");
    }
  }, [machine, searchParams]);

  useEffect(() => {
    setLines([]);
    setLinesKey(null);
    setHiddenIds([]);
    setHiddenKey(null);
    setTrayOpen(false);
    undoRemoveRef.current = null;
    if (undoRemoveTimer.current != null) {
      window.clearTimeout(undoRemoveTimer.current);
      undoRemoveTimer.current = null;
    }
    setUndoRemove(null);
  }, [machineId]);

  // Read storage as soon as the key exists (not after the machine loads), and only let the
  // persist effect write once `linesKey` says `lines` belongs to this key. Otherwise the first
  // render with an empty tray, or the previous machine's tray, overwrites what was saved.
  useEffect(() => {
    if (!trayStorageKey) {
      return;
    }
    const persisted = readPersistedTrayLines(trayStorageKey);
    setLines((current) => mergeHydratedTrayLines(persisted, current));
    setLinesKey(trayStorageKey);
    if (trayNoteStorageKey) {
      if (persisted.length === 0) {
        setTrayNote("");
        writePersistedTrayNote(trayNoteStorageKey, "");
      } else {
        setTrayNote(readPersistedTrayNote(trayNoteStorageKey));
      }
    }
  }, [trayStorageKey, trayNoteStorageKey]);

  useEffect(() => {
    if (!trayNoteStorageKey || linesKey !== trayStorageKey) {
      return;
    }
    writePersistedTrayNote(trayNoteStorageKey, trayNote);
  }, [trayNote, trayNoteStorageKey, linesKey, trayStorageKey]);

  const lifecycleIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const part of machine?.parts ?? []) {
      ids.add(part.id);
    }
    for (const line of lines) {
      ids.add(line.part.id);
    }
    if (selectedPart?.id) {
      ids.add(selectedPart.id);
    }
    return [...ids].join("\n");
  }, [machine?.parts, lines, selectedPart?.id]);

  const selectedPartForSheet = useMemo(() => {
    if (!selectedPart) {
      return null;
    }
    const lookedUp = lifecycleById[selectedPart.id];
    if (!lookedUp) {
      return selectedPart;
    }
    return { ...selectedPart, lifecycle: lookedUp };
  }, [selectedPart, lifecycleById]);

  useEffect(() => {
    const ids = lifecycleIdsKey ? lifecycleIdsKey.split("\n").filter(Boolean) : [];
    const missing = ids.filter((id) => !lifecycleAsked.current.has(id));
    if (missing.length === 0) {
      return;
    }
    for (const id of missing) {
      lifecycleAsked.current.add(id);
    }
    void lookupPartLifecycle(missing)
      .then((map) => {
        setLifecycleById((current) => {
          const next = { ...current, ...map };
          for (const id of missing) {
            if (!next[id]) {
              next[id] = { status: "unknown" };
            }
          }
          return next;
        });
      })
      .catch(() => {
        for (const id of missing) {
          lifecycleAsked.current.delete(id);
        }
      });
  }, [lifecycleIdsKey]);

  const trayLines = useMemo(
    () => resolveTrayLines(lines, machine?.parts, lifecycleById),
    [lines, machine, lifecycleById],
  );

  useEffect(() => {
    trayPersistRef.current = { storageKey: trayStorageKey, linesKey };
  }, [trayStorageKey, linesKey]);

  const commitTrayLinesToStorage = useCallback(
    (next: TrayLine[], force = false) => {
      if (!trayStorageKey) {
        return;
      }
      const { storageKey, linesKey: readyKey } = trayPersistRef.current;
      if (!storageKey) {
        return;
      }
      if (!force && readyKey !== storageKey) {
        return;
      }
      writePersistedTrayLines(
        storageKey,
        next.map((line) => trayLineToPersisted(line.part, line.qty)),
      );
    },
    [trayStorageKey],
  );

  const rehydrateTrayLinesFromStorage = useCallback(() => {
    if (!trayStorageKey || !machine) {
      return;
    }
    const persisted = readPersistedTrayLines(trayStorageKey);
    setLines(
      persisted.map((row) => ({
        part: machine.parts.find((item) => item.id === row.id) ?? persistedToPart(row),
        qty: row.qty,
      })),
    );
  }, [machine, trayStorageKey]);

  useEffect(() => {
    if (!trayStorageKey || linesKey !== trayStorageKey) {
      return;
    }
    commitTrayLinesToStorage(lines);
  }, [lines, linesKey, trayStorageKey, commitTrayLinesToStorage]);

  const hiddenStorageKey = user?.tenantId ? hiddenPartsStorageKey(user.tenantId, machineId) : null;

  useEffect(() => {
    if (!hiddenStorageKey || !machine || machine.id !== machineId || hiddenKey === hiddenStorageKey) {
      return;
    }
    setHiddenIds(pruneHiddenParts(readPersistedHiddenParts(hiddenStorageKey), machine.parts));
    setHiddenKey(hiddenStorageKey);
  }, [hiddenStorageKey, hiddenKey, machine, machineId]);

  useEffect(() => {
    if (!hiddenStorageKey || hiddenKey !== hiddenStorageKey) {
      return;
    }
    writePersistedHiddenParts(hiddenStorageKey, hiddenIds);
  }, [hiddenIds, hiddenKey, hiddenStorageKey]);

  useEffect(() => {
    if (!selectedPart) {
      return;
    }
    function partSheetGesture(event: PointerEvent) {
      return event.composedPath().some(
        (node) => node instanceof Element && node.closest("[data-part-sheet]") !== null,
      );
    }

    function onPointerDown(event: PointerEvent) {
      if (partSheetGesture(event)) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-parts-bom]")) {
        return;
      }
      if (target.closest("[data-staff-parts]")) {
        return;
      }
      if (target.closest("[data-staff-edit]")) {
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
      if (target.closest(".explode-slider")) {
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

  const hasModel = machineHasModel(machine ?? { hasModel: false });
  const src = hasModel ? (machine?.fileUrl ?? "") : "";
  const joinedParts: ViewerPart[] = machine?.parts ?? [];
  const selectedManualSubChildren = useMemo(() => {
    if (!machine || !selectedPart) {
      return [];
    }
    const group = groupForPart(machine.manualSubAssemblies, selectedPart);
    if (!group) {
      return [];
    }
    return group.children.map((child) => manualChildAsPart(child, selectedPart));
  }, [machine, selectedPart]);
  const atRiskPartsOnMachine = useMemo(() => {
    return joinedParts.filter((part) => {
      const lifecycle = lifecycleById[part.id];
      return lifecycle?.status === "obsolete" || lifecycle?.status === "announced";
    });
  }, [joinedParts, lifecycleById]);

  const clearUndoRemove = useCallback(() => {
    if (undoRemoveTimer.current != null) {
      window.clearTimeout(undoRemoveTimer.current);
      undoRemoveTimer.current = null;
    }
    undoRemoveRef.current = null;
    setUndoRemove(null);
    rehydrateTrayLinesFromStorage();
  }, [rehydrateTrayLinesFromStorage]);

  const showUndoRemove = useCallback((removed: TrayLine) => {
    if (undoRemoveTimer.current != null) {
      window.clearTimeout(undoRemoveTimer.current);
    }
    undoRemoveRef.current = removed;
    setUndoRemove(removed);
    undoRemoveTimer.current = window.setTimeout(() => {
      setUndoRemove(null);
      undoRemoveRef.current = null;
      undoRemoveTimer.current = null;
    }, UNDO_REMOVE_MS);
  }, []);

  const removeTrayLine = useCallback(
    (partId: string) => {
      const removed = lines.find((line) => line.part.id === partId);
      if (!removed) {
        return;
      }
      const next = lines.filter((line) => line.part.id !== partId);
      if (next.length === 0) {
        setTrayNote("");
      }
      commitTrayLinesToStorage(next, true);
      setLines(next);
      showUndoRemove(removed);
    },
    [lines, commitTrayLinesToStorage, showUndoRemove],
  );

  const undoTrayRemove = useCallback(() => {
    const removed = undoRemoveRef.current ?? undoRemove;
    if (!removed) {
      return;
    }
    setLines((current) => {
      if (current.some((line) => line.part.id === removed.part.id)) {
        commitTrayLinesToStorage(current, true);
        return current;
      }
      const next = [...current, removed];
      commitTrayLinesToStorage(next, true);
      return next;
    });
    if (undoRemoveTimer.current != null) {
      window.clearTimeout(undoRemoveTimer.current);
      undoRemoveTimer.current = null;
    }
    undoRemoveRef.current = null;
    setUndoRemove(null);
    if (isCustomer && customerTrayInViewer) {
      setTrayOpen(true);
    }
  }, [undoRemove, commitTrayLinesToStorage, isCustomer, customerTrayInViewer]);

  const flashAddToast = useCallback((label: string) => {
    setAddToast(label);
    if (addToastTimer.current != null) {
      window.clearTimeout(addToastTimer.current);
    }
    addToastTimer.current = window.setTimeout(() => {
      setAddToast(null);
      addToastTimer.current = null;
    }, 2400);
  }, []);

  const commitTrayLine = useCallback(
    (part: Part, addQty: number) => {
      const qty = Math.max(1, addQty);
      if (isCustomer) {
        setTrayOpen(true);
      }
      setLines((current) => {
        const existing = current.find((line) => line.part.id === part.id);
        if (existing) {
          return current.map((line) =>
            line.part.id === part.id ? { ...line, qty: line.qty + qty } : line,
          );
        }
        return [...current, { part, qty }];
      });
      playQuoteAddMotion();
      flashAddToast(part.name);
    },
    [flashAddToast, isCustomer],
  );

  const tray = useMemo(() => {
    if (!isCustomer) {
      return null;
    }
    return (
      <QuoteTray
        machineId={machineId}
        lines={trayLines}
        note={trayNote}
        onNote={setTrayNote}
        pickSeed={trayPickSeed}
        onAdd={(part, qty) => {
          commitTrayLine(part, qty);
        }}
        onQty={(partId, qty) => {
          setLines((current) =>
            current.map((line) =>
              line.part.id === partId ? { ...line, qty } : line,
            ),
          );
        }}
        onRemove={removeTrayLine}
        onClear={() => {
          setLines([]);
          setTrayNote("");
        }}
        open={trayOpen}
        onOpenChange={setTrayOpen}
      />
    );
  }, [
    isCustomer,
    trayLines,
    trayNote,
    machineId,
    trayOpen,
    trayPickSeed,
    commitTrayLine,
    removeTrayLine,
  ]);

  if (loading) {
    return <MachineWorkspaceSkeleton />;
  }

  if (notFound) {
    return (
      <EmptyState
        title="Machine not found"
        message="This machine does not exist, or you do not have access."
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

  function fitExploded() {
    setViewerFitKey((key) => key + 1);
  }

  function showAll() {
    setHiddenIds([]);
    setIsolatedId(null);
  }

  function fitView() {
    setViewerFitKey((key) => key + 1);
  }

  function resetView() {
    setExplode(0);
    setHiddenIds([]);
    setIsolatedId(null);
    setViewerResetKey((key) => key + 1);
  }

  function exitViewerFullscreen() {
    exit();
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
      setViewerFitKey((key) => key + 1);
    }
    if (shouldAutoDismissPartSheet("hide")) {
      setSelectedPart(null);
    }
  }

  function isolateSelected() {
    if (!selectedPart) {
      return;
    }
    if (isolatedId === selectedPart.id) {
      setIsolatedId(null);
      setViewerFitKey((key) => key + 1);
    } else {
      setIsolatedId(selectedPart.id);
      setHiddenIds((current) => current.filter((id) => id !== selectedPart.id));
      setViewerFitKey((key) => key + 1);
    }
    if (shouldAutoDismissPartSheet("isolate")) {
      setSelectedPart(null);
    }
  }

  function addPart(part: Part) {
    commitTrayLine(part, part.qty || 1);
    if (isCustomer && dismissPartSheetAfterQuoteAdd()) {
      setSelectedPart(null);
    }
  }

  async function saveStaffPart(edit: {
    key: string;
    partNumber: string;
    name: string;
    meshName: string;
    qty: number;
  }) {
    setSavingPart(true);
    setSaveError(null);
    try {
      const next = await updateMachinePart(machineId, edit);
      setMachine(next);
      const part = next.parts.find((item) => item.id === edit.partNumber) ?? null;
      setSelectedPart(part);
      setSuggestedMesh(null);
      const row = staffCatalogRows(next.parts, next.unmatched ?? []).find(
        (item) => item.partNumber === edit.partNumber,
      );
      return row?.key;
    } catch (cause: unknown) {
      setSaveError(errorMessage(cause, "Could not save that part."));
      return;
    } finally {
      setSavingPart(false);
    }
  }

  const quoteCount = trayLines.reduce((sum, line) => sum + line.qty, 0);

  const viewerOverlayClass =
    "machine-viewer fixed inset-0 z-[85] flex min-h-0 w-screen max-w-none flex-col overflow-hidden overscroll-none";

  const viewerBlock = (
    <div
      ref={chromeRef}
      data-machine-viewer-chrome=""
      data-viewer-fs={fullscreen ? (overlay ? "overlay" : "native") : undefined}
      className={
        overlay
          ? viewerOverlayClass
          : "machine-viewer flex min-h-0 flex-col overflow-hidden sm:rounded-[28px]"
      }
      style={
        overlay
          ? overlayFrame
            ? {
                background: VIEWER_STAGE,
                top: overlayFrame.topPx,
                height: overlayFrame.heightPx,
                width: "100vw",
                maxWidth: "100vw",
              }
            : {
                background: VIEWER_STAGE,
                width: "100vw",
                maxWidth: "100vw",
              }
          : { background: VIEWER_STAGE }
      }
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <div
        ref={viewerLayoutRef}
        className="relative min-h-0 flex-1"
        data-machine-viewer-layout=""
      >
        {src && viewerMountReady ? (
          <PartPicker
            src={src}
            parts={joinedParts}
            selectedId={selectedPart?.id ?? null}
            explode={explode}
            fitKey={viewerFitKey}
            resetKey={viewerResetKey}
            viewerFullscreen={fullscreen}
            layoutRootRef={viewerLayoutRef}
            hiddenIds={hiddenIds}
            isolatedId={isolatedId}
            onSelect={setSelectedPart}
            onUnmatchedSelect={
              isCustomer
                ? undefined
                : (mesh) => {
                    if (mesh?.meshName) {
                      setSuggestedMesh(mesh.meshName);
                    }
                  }
            }
            onLongPress={(part) => {
              setSelectedPart(part);
              setHeld(true);
              window.setTimeout(() => setHeld(false), 240);
            }}
            className={`absolute inset-0 ${view === "list" ? "invisible pointer-events-none" : ""}`}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-8 text-center">
            <div>
              <p className="text-[18px] font-semibold tracking-tight text-[var(--spares-on-chip)]">
                No 3D model
              </p>
              <p className="chrome-quiet mt-2 max-w-sm text-[14px] leading-relaxed">
                {machine.oem ? `${machine.oem}. ` : ""}
                Quotes and tickets still work.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Link
                  href={machineTabHref(machine.id, "tickets")}
                  className="btn-soft inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
                >
                  Tickets
                </Link>
                <Link
                  href={machineTabHref(machine.id, "quotes")}
                  className="btn-soft inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
                >
                  Quotes
                </Link>
                {!isCustomer ? (
                  <Link
                    href={`/machines/new?replace=${machine.id}`}
                    className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
                  >
                    Upload pack
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        )}
        {view === "list" && !staffSplitView ? (
          <section
            data-parts-bom=""
            className={`absolute inset-0 z-[15] bg-[var(--spares-paper)] ${
              isCustomer
                ? "overflow-y-auto px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]"
                : "flex flex-col"
            }`}
            style={{ paddingTop: "3.65rem" }}
          >
            {isCustomer ? (
              <>
                <p
                  className="mb-3 line-clamp-2 text-[15px] font-semibold leading-snug"
                  title={machine.name}
                >
                  {machine.name}
                </p>
                <PartsBom
                  parts={joinedParts}
                  manualSubAssemblies={machine.manualSubAssemblies}
                  selectedPartId={selectedPart?.id ?? null}
                  onSelect={(part) => {
                    setSelectedPart(part);
                  }}
                  showAdd
                  onAdd={addPart}
                  searchable
                />
              </>
            ) : (
              <StaffPartsReview
                machine={machine}
                selectedPartId={selectedPart?.id ?? null}
                suggestedMeshName={suggestedMesh}
                onSuggestedMeshUsed={() => setSuggestedMesh(null)}
                onSelectPart={setSelectedPart}
                onSave={saveStaffPart}
                onMachineUpdated={setMachine}
                saving={savingPart}
                saveError={saveError}
              />
            )}
          </section>
        ) : null}
        {selectedPartForSheet && (view === "model" || (isCustomer && view === "list")) ? (
          <SelectedPartSheet
            part={selectedPartForSheet}
            manualSubChildren={selectedManualSubChildren}
            onSelectSubPart={setSelectedPart}
            isolated={Boolean(selectedPart && isolatedId === selectedPart.id)}
            isolatedViewPart={
              isolatedId
                ? (joinedParts.find((item) => item.id === isolatedId) ??
                  (selectedPartForSheet?.id === isolatedId ? selectedPartForSheet : null))
                : null
            }
            onHide={hideSelected}
            onIsolate={isolateSelected}
            onShowAll={showAll}
            onAdd={isCustomer ? addPart : undefined}
            onDismiss={() => setSelectedPart(null)}
            showAdd={isCustomer}
            held={held}
            listView={isCustomer && view === "list"}
            quoteTrayPeek={isCustomer && view === "list" && trayOpen}
          />
        ) : null}
        {customerTrayInViewer ? tray : null}
        <div
          aria-hidden="true"
          className="viewer-chrome-shade pointer-events-none absolute inset-x-0 top-0 z-10 h-20"
        />
        <div className="absolute top-3 right-3 left-3 z-20 flex min-w-0 flex-col gap-2">
          {!isCustomer && atRiskPartsOnMachine.length > 0 && view === "model" ? (
            <div className="flex flex-wrap gap-2" data-machine-lifecycle-links="">
              {atRiskPartsOnMachine.map((part) => (
                <Link
                  key={part.id}
                  href={staffPartLifecycleViewHref(part.id)}
                  className="btn-primary inline-flex h-9 items-center rounded-full px-3 text-[12px] font-semibold"
                >
                  View part
                </Link>
              ))}
            </div>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {showViewToggle && hasModel ? (
              <div className="viewer-chrome-chip flex h-11 shrink-0 items-center rounded-full px-1">
                <button
                  type="button"
                  onClick={() => setView("model")}
                  className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold ${
                    view === "model" ? "bg-white/12" : "chrome-quiet"
                  }`}
                >
                  3D
                </button>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold ${
                    view === "list" ? "bg-white/12" : "chrome-quiet"
                  }`}
                >
                  List
                </button>
              </div>
            ) : null}
            {hasModel && ((showViewToggle && view === "model") || staffSplitView) ? (
              <>
                <button
                  type="button"
                  data-show-all=""
                  aria-label="Show all parts"
                  onClick={showAll}
                  className="viewer-chrome-chip inline-flex h-11 shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold"
                >
                  Show all
                </button>
                <button
                  type="button"
                  data-fit-view=""
                  aria-label="Fit view to assembly"
                  onClick={fitView}
                  className="viewer-chrome-chip inline-flex h-11 shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold"
                >
                  Fit view
                </button>
                <button
                  type="button"
                  data-reset-view=""
                  aria-label="Reset view to first load"
                  onClick={resetView}
                  className="viewer-chrome-chip inline-flex h-11 shrink-0 items-center justify-center rounded-full px-3 text-sm font-semibold"
                >
                  Reset view
                </button>
              </>
            ) : showViewToggle ? (
              <div className="min-w-0 flex-1" />
            ) : null}
            {hasModel && ((showViewToggle && view === "model") || staffSplitView) ? (
              <label className="viewer-chrome-chip flex min-h-11 min-w-[8.5rem] flex-1 basis-[8.5rem] items-center gap-2 px-3">
                <span className="chrome-quiet shrink-0 text-[12px] font-medium tracking-wide sm:text-[13px]">
                  Explode
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(explode * 100)}
                  onChange={(event) => setExplode(Number(event.target.value) / 100)}
                  onPointerUp={fitExploded}
                  onPointerCancel={fitExploded}
                  onKeyUp={fitExploded}
                  className="explode-slider min-w-0 flex-1"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(explode * 100)}
                  aria-label="Explode assembly"
                />
              </label>
            ) : null}
          {isCustomer && fullscreen ? (
            <QuoteTray
              machineId={machine.id}
              lines={trayLines}
              note={trayNote}
              onNote={setTrayNote}
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
              <span
                data-quote-target="badge"
                className="btn-accent inline-flex min-w-6 justify-center rounded-full px-2 py-0.5 text-xs tabular-nums"
              >
                {quoteCount}
              </span>
            </button>
          ) : null}
          {hasModel ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                if (fullscreen) {
                  exitViewerFullscreen();
                } else {
                  enter();
                }
              }}
              className="viewer-chrome-chip relative z-40 inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold"
              aria-label={fullscreen ? "Exit full screen" : "Enter full screen"}
            >
              {fullscreen ? (
                <span className="text-xl leading-none" aria-hidden="true">×</span>
              ) : (
                <ExpandIcon />
              )}
              <span className="hidden sm:inline">
                {fullscreen ? "Exit" : "Full screen"}
              </span>
            </button>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  const staffPartsPanel = (
    <aside className="machine-bom" data-parts-bom="">
      <StaffPartsReview
        machine={machine}
        selectedPartId={selectedPart?.id ?? null}
        suggestedMeshName={suggestedMesh}
        onSuggestedMeshUsed={() => setSuggestedMesh(null)}
        onSelectPart={setSelectedPart}
        onSave={saveStaffPart}
        onMachineUpdated={setMachine}
        saving={savingPart}
        saveError={saveError}
      />
    </aside>
  );

  return (
    <div className="machine-stage">
      <DocumentTitle title={machine.name} />
      <h1 className="sr-only">{machine.name}</h1>
      {isCustomer ? <QuoteAddToast message={addToast} /> : null}
      {isCustomer && undoRemove && hydrated
        ? createPortal(
            <QuoteUndoToast
              label={undoRemove.part.name}
              onUndo={undoTrayRemove}
              onDismiss={clearUndoRemove}
            />,
            document.body,
          )
        : null}

      <div
        ref={staffSplitView ? staffSplit.containerRef : undefined}
        className="machine-stage-grid"
        data-tray={
          isCustomer && trayOpen && !fullscreen && customerTrayDock ? "open" : "closed"
        }
        data-customer-desktop={isCustomer && customerTrayDock ? "true" : undefined}
        data-staff-split={staffSplitView ? "true" : undefined}
        style={
          staffSplitView
            ? ({ "--staff-split": `${staffSplit.split * 100}%` } as React.CSSProperties)
            : undefined
        }
      >
        {viewerBlock}
        {staffSplitView ? (
          <>
            <div
              className="machine-split-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize 3D and parts list"
              {...staffSplit.handleProps}
            />
            {staffPartsPanel}
          </>
        ) : null}
        {isCustomer && customerTrayDock && !fullscreen ? (
          <div
            className={`quote-tray-dock${trayOpen ? " is-open" : ""}`}
            data-quote-tray=""
          >
            {tray}
          </div>
        ) : null}
      </div>
    </div>
  );
}
