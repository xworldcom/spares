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
              className="btn-primary inline-flex rounded-full px-4 py-2 text-sm font-medium"
            >
              Upload pack
            </Link>
          ) : null
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-neutral-200/80 overflow-hidden rounded-[24px] bg-white">
      {machines.map((machine) => (
        <li key={machine.id}>
          <Link
            href={`/machines/${machine.id}`}
            className="flex min-h-16 items-center justify-between gap-3 px-5 py-4 hover:bg-neutral-50"
          >
            <span className="min-w-0 truncate text-[17px] font-medium tracking-tight text-neutral-950">
              {machine.name}
            </span>
            <span className="text-lg text-neutral-300" aria-hidden="true">
              ›
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
