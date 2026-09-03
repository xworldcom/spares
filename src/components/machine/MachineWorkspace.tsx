"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PartsBom } from "@/components/machine/PartsBom";
import { SelectedPartPanel } from "@/components/machine/SelectedPartPanel";
import { UnmatchedMeshes } from "@/components/machine/UnmatchedMeshes";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { PartPicker } from "@/components/viewer";
import { getMachine, machineFileSrc } from "@/lib/api/machines";
import { errorMessage, isNotFound, isUnauthorized } from "@/lib/api/errors";
import type { MachineDetail, Part } from "@/lib/api/types";

export function MachineWorkspace({ machineId }: { machineId: string }) {
  const { user } = useAuth();
  const [machine, setMachine] = useState<MachineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getMachine(machineId, user?.role)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setMachine(next);
        setSelectedPart(null);
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

  const src = machineFileSrc(machine.id);
  const joinedParts = machine.parts;
  const showUnmatched =
    user?.role === "staff" && machine.unmatched !== undefined;

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
          {src ? (
            <PartPicker src={src} parts={joinedParts} onSelect={setSelectedPart} />
          ) : (
            <EmptyState
              title="No model"
              message="This machine pack does not have a GLB or GLTF file to display."
            />
          )}
        </div>
        <div className="space-y-4">
          <SelectedPartPanel part={selectedPart} />
          {user?.role === "customer" ? (
            <QuoteForm machineId={machine.id} part={selectedPart} />
          ) : (
            <p className="text-sm text-neutral-600">
              Customers request quotes from this page. Staff inspect the join
              here. Unmatched meshes stay in the staff panel, not the picker.
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
            Joined ETO-shaped BOM. Join key is part number. Qty is on each row.
            These are the only parts the picker can select.
          </p>
        </div>
        <PartsBom
          parts={joinedParts}
          selectedPartId={selectedPart?.id ?? null}
          onSelect={setSelectedPart}
        />
      </section>

      {showUnmatched ? <UnmatchedMeshes unmatched={machine.unmatched ?? []} /> : null}
    </div>
  );
}
