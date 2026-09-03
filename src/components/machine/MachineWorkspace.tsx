"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PartsBom } from "@/components/machine/PartsBom";
import { SelectedPartPanel } from "@/components/machine/SelectedPartPanel";
import { UnmatchedMeshes } from "@/components/machine/UnmatchedMeshes";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { ViewerSlot } from "@/components/viewer/ViewerSlot";
import { getMachine, machineFilePath } from "@/lib/api/machines";
import { errorMessage, isNotFound, isUnauthorized } from "@/lib/api/errors";
import type { MachineDetail, Part } from "@/lib/api/types";

export function MachineWorkspace({ machineId }: { machineId: string }) {
  const { user } = useAuth();
  const [machine, setMachine] = useState<MachineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMachine(machineId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setMachine(next);
        setError(null);
        setNotFound(false);
        setModelError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setMachine(null);
        setModelError(null);
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
  }, [machineId, reloadKey]);

  const handlePick = useCallback((partId: string | null) => {
    setSelectedPartId(partId);
  }, []);

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

  const selected: Part | null =
    machine.parts.find((part) => part.id === selectedPartId) ?? null;
  const fileUrl = machine.fileUrl || machineFilePath(machine.id);
  const showUnmatched = user?.role === "staff";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Machine pack
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{machine.name}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.9fr)]">
        <div className="space-y-3">
          <ViewerSlot
            fileUrl={fileUrl || null}
            parts={machine.parts}
            selectedPartId={selectedPartId}
            onPick={handlePick}
            onLoadError={setModelError}
            loadError={modelError}
          />
        </div>
        <div className="space-y-4">
          <SelectedPartPanel part={selected} />
          {user?.role === "customer" ? (
            <QuoteForm machineId={machine.id} part={selected} />
          ) : (
            <p className="text-sm text-neutral-600">
              Customers request quotes from this page. Staff can inspect the
              join and unmatched meshes.
            </p>
          )}
        </div>
      </div>

      <section aria-labelledby="bom-heading" className="space-y-3">
        <div>
          <h2 id="bom-heading" className="text-sm font-semibold text-neutral-900">
            Parts list
          </h2>
          <p className="text-sm text-neutral-600">
            Fake ETO-shaped BOM for Ticket 1. Join key is part number. Qty is
            shown on each row.
          </p>
        </div>
        <PartsBom
          parts={machine.parts}
          selectedPartId={selectedPartId}
          onSelect={handlePick}
        />
      </section>

      {showUnmatched ? (
        <UnmatchedMeshes unmatched={machine.unmatched ?? []} />
      ) : null}
    </div>
  );
}
