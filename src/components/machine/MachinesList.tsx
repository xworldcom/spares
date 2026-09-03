"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { listMachines } from "@/lib/api/machines";
import { errorMessage } from "@/lib/api/errors";
import type { MachineSummary } from "@/lib/api/types";

export function MachinesList() {
  const { user } = useAuth();
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listMachines()
      .then((next) => {
        if (cancelled) {
          return;
        }
        setMachines(next);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load machines."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (loading) {
    return <LoadingState label="Loading machines…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load machines"
        message={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  if (machines.length === 0) {
    return (
      <EmptyState
        title="No machines yet"
        message={
          user?.role === "staff"
            ? "Upload a pack (3D file + ETO-shaped parts list) to create the first machine."
            : "No machine packs are available yet. Ask staff to upload one."
        }
        action={
          user?.role === "staff" ? (
            <Link
              href="/machines/new"
              className="inline-flex rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              Upload pack
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 bg-white">
      {machines.map((machine) => (
        <li key={machine.id}>
          <Link
            href={`/machines/${machine.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
          >
            <span className="font-medium text-neutral-900">{machine.name}</span>
            <span className="font-mono text-xs text-neutral-500">{machine.id}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
