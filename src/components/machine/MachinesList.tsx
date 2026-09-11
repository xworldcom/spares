"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { listSites } from "@/lib/api/auth";
import { listMachines, deleteMachine, updateMachineName, updateMachineSite } from "@/lib/api/machines";
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
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MachineSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "Could not update that plant."));
    } finally {
      setSavingId(null);
    }
  }

  function startRename(machine: MachineSummary) {
    setEditingNameId(machine.id);
    setNameDraft(machine.name);
    setError(null);
  }

  function cancelRename() {
    setEditingNameId(null);
    setNameDraft("");
  }

  async function saveRename(machineId: string) {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setError("Enter a machine name.");
      return;
    }
    const current = machines.find((row) => row.id === machineId);
    if (!current || trimmed === current.name) {
      cancelRename();
      return;
    }

    setSavingId(machineId);
    try {
      const next = await updateMachineName(machineId, trimmed);
      setMachines((rows) =>
        rows.map((row) =>
          row.id === machineId
            ? {
                ...row,
                name: next.name,
              }
            : row,
        ),
      );
      cancelRename();
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "Could not rename that machine."));
    } finally {
      setSavingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }
    setDeletingId(deleteTarget.id);
    try {
      await deleteMachine(deleteTarget.id);
      setMachines((rows) => rows.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "Could not delete that machine."));
    } finally {
      setDeletingId(null);
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
    <>
      {error ? (
        <p className="mb-4 rounded-[20px] bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}
      {deleteTarget ? (
        <div
          role="dialog"
          aria-labelledby="delete-machine-title"
          className="mb-4 rounded-[24px] border border-red-200 bg-red-50 p-5"
        >
          <p id="delete-machine-title" className="text-[17px] font-semibold text-red-950">
            Delete {deleteTarget.name}?
          </p>
          <p className="mt-1 text-sm leading-relaxed text-red-900/80">
            This removes the machine from the list and deletes its stored 3D file.
            Customers will no longer see it. This cannot be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deletingId === deleteTarget.id}
              className="btn-soft inline-flex h-11 items-center rounded-full px-4 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void confirmDelete();
              }}
              disabled={deletingId === deleteTarget.id}
              className="inline-flex h-11 items-center rounded-full bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {deletingId === deleteTarget.id ? "Deleting…" : "Delete machine"}
            </button>
          </div>
        </div>
      ) : null}
      <ul className="spares-surface divide-y divide-black/6 overflow-hidden rounded-[24px]">
      {machines.map((machine) => (
        <li key={machine.id}>
          <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              {user?.role === "staff" && editingNameId === machine.id ? (
                <div className="space-y-2">
                  <label className="sr-only" htmlFor={`machine-name-${machine.id}`}>
                    Machine name
                  </label>
                  <input
                    id={`machine-name-${machine.id}`}
                    value={nameDraft}
                    disabled={savingId === machine.id}
                    onChange={(event) => setNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void saveRename(machine.id);
                      }
                      if (event.key === "Escape") {
                        cancelRename();
                      }
                    }}
                    onBlur={() => {
                      void saveRename(machine.id);
                    }}
                    className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={cancelRename}
                    className="text-sm font-medium text-neutral-600"
                  >
                    Cancel rename
                  </button>
                </div>
              ) : (
                <Link href={`/machines/${machine.id}`} className="block min-w-0">
                  <span className="block truncate text-[17px] font-medium tracking-tight text-neutral-950">
                    {machine.name}
                  </span>
                  <span className="spares-muted mt-0.5 block truncate text-[13px]">
                    {machine.company && machine.siteName
                      ? siteLabel({ company: machine.company, name: machine.siteName })
                      : user?.role === "staff"
                        ? "No plant — customers cannot see this"
                        : ""}
                    {machine.version && machine.version > 1
                      ? ` · v${machine.version}`
                      : ""}
                  </span>
                </Link>
              )}
            </div>
            {user?.role === "staff" ? (
              <div className="flex w-full max-w-xs shrink-0 flex-col gap-2 sm:w-56">
                <select
                  value={machine.siteId ?? ""}
                  disabled={savingId === machine.id}
                  onChange={(event) => {
                    void onAssign(machine.id, event.target.value);
                  }}
                  className="spares-field h-11 w-full max-w-xs shrink-0 rounded-2xl border-0 px-3 text-[15px] outline-none sm:w-56"
                  aria-label={`Plant for ${machine.name}`}
                >
                  <option value="">No plant</option>
                  {sites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {siteLabel(site)}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium">
                  {editingNameId === machine.id ? null : (
                    <button
                      type="button"
                      onClick={() => startRename(machine)}
                      className="text-neutral-700"
                    >
                      Rename
                    </button>
                  )}
                  <Link
                    href={`/machines/new?replace=${machine.id}`}
                    className="text-neutral-700"
                  >
                    Replace pack
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTarget(machine);
                      setError(null);
                    }}
                    className="text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <span className="text-lg text-neutral-300" aria-hidden="true">
                ›
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
    </>
  );
}
