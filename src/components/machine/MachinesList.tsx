"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { listSites } from "@/lib/api/auth";
import { listMachines, updateMachineSite } from "@/lib/api/machines";
import { errorMessage, isUnauthorized } from "@/lib/api/errors";
import type { MachineSummary, Site } from "@/lib/api/types";
import { siteLabel } from "@/lib/access";

const RETRY_ATTEMPTS = 3;

async function loadMachines(heal: boolean): Promise<MachineSummary[]> {
  const next = await listMachines(heal ? { heal: true } : undefined);
  if (next.length > 0 || heal) {
    return next;
  }
  return listMachines({ heal: true });
}

export function MachinesList() {
  const { user, refresh } = useAuth();
  const [machines, setMachines] = useState<MachineSummary[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sitesLoad =
      user?.role === "staff" ? listSites().catch(() => [] as Site[]) : Promise.resolve([] as Site[]);
    Promise.all([loadMachines(false), sitesLoad])
      .then(([next, nextSites]) => {
        if (cancelled) {
          return;
        }
        setMachines(next);
        setSites(nextSites);
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
  }, [user?.role]);

  async function onAssign(machineId: string, siteId: string) {
    setSavingId(machineId);
    try {
      const next = await updateMachineSite(machineId, siteId || null);
      setMachines((current) =>
        current.map((row) =>
          row.id === machineId
            ? {
                ...row,
                siteId: next.siteId,
                company: next.company,
                siteName: next.siteName,
              }
            : row,
        ),
      );
    } catch (cause) {
      setError(errorMessage(cause, "Could not update that plant."));
    } finally {
      setSavingId(null);
    }
  }

  async function retry() {
    setLoading(true);
    setError(null);
    let lastCause: unknown = null;
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt += 1) {
      try {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
        const next = await listMachines({ heal: true });
        if (next.length > 0) {
          setMachines(next);
          setError(null);
          setLoading(false);
          return;
        }
        setMachines(next);
      } catch (cause: unknown) {
        lastCause = cause;
        if (isUnauthorized(cause)) {
          await refresh();
        }
      }
    }
    if (lastCause) {
      setError(errorMessage(lastCause, "Could not load machines."));
    }
    setLoading(false);
  }

  if (loading) {
    return <LoadingState label="Loading machines…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load machines"
        message={error}
        onRetry={() => {
          void retry();
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
            : "No machine packs are available yet. Ask staff to upload one, or try again if this page just opened."
        }
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                void retry();
              }}
              className="btn-soft inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
            >
              Try again
            </button>
            {user?.role === "staff" ? (
              <Link
                href="/machines/new"
                className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-medium"
              >
                Upload pack
              </Link>
            ) : null}
          </div>
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-neutral-200/80 overflow-hidden rounded-[24px] bg-white">
      {machines.map((machine) => (
        <li key={machine.id}>
          <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href={`/machines/${machine.id}`}
              className="min-w-0 flex-1"
            >
              <span className="block truncate text-[17px] font-medium tracking-tight text-neutral-950">
                {machine.name}
              </span>
              <span className="spares-muted mt-0.5 block truncate text-[13px]">
                {machine.company && machine.siteName
                  ? siteLabel({ company: machine.company, name: machine.siteName })
                  : user?.role === "staff"
                    ? "No plant — customers cannot see this"
                    : ""}
              </span>
            </Link>
            {user?.role === "staff" ? (
              <select
                value={machine.siteId ?? ""}
                disabled={savingId === machine.id}
                onChange={(event) => {
                  void onAssign(machine.id, event.target.value);
                }}
                className="h-11 w-full max-w-xs shrink-0 rounded-2xl border-0 bg-[#f4f5f7] px-3 text-[15px] outline-none sm:w-56"
                aria-label={`Plant for ${machine.name}`}
              >
                <option value="">No plant</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {siteLabel(site)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-lg text-neutral-300" aria-hidden="true">
                ›
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
