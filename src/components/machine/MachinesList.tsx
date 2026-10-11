"use client";

import Link from "next/link";
import { PrefetchLink } from "@/components/nav/PrefetchLink";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CatalogSearch } from "@/components/catalog/CatalogSearch";
import { CatalogSkeleton } from "@/components/catalog/CatalogSkeleton";
import { MachineGlyph } from "@/components/catalog/CatalogGlyph";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { listSites, listCustomerAccounts } from "@/lib/api/auth";
import { listAccessibleTickets } from "@/lib/api/care";
import { listMachines, deleteMachine, updateMachineName, updateMachineSite } from "@/lib/api/machines";
import { listQuotes } from "@/lib/api/quotes";
import { errorMessage, isUnauthorized } from "@/lib/api/errors";
import type {
  CustomerAccount,
  MachineSummary,
  MachinesListResponse,
  Site,
} from "@/lib/api/types";
import { siteLabel } from "@/lib/access";
import { ticketIsOpen } from "@/lib/care";
import { machineTabHref } from "@/lib/machine-context";
import { seedMachineName } from "@/lib/machine-name-cache";
import { warmMachineRoute } from "@/lib/nav/prefetch";
import { quoteIsOpen } from "@/lib/quotes";
import { catalogQueryMatch } from "@/lib/ui/catalog-query";
import { MachineSitePicker } from "@/components/staff/MachineSitePicker";
import { MachineTypeahead } from "@/components/machine/MachineTypeahead";
import { useRouter } from "next/navigation";
import { machineHasModel, sitesForMachineCreate } from "@/lib/machines";
import { warmQuotesList } from "@/lib/nav/prefetch";
import { useRequestGeneration } from "@/lib/ui/request-generation";

const RETRY_ATTEMPTS = 3;

type MachineWork = {
  quotesOpen: number;
  ticketsOpen: number;
};

async function loadMachines(options?: {
  heal?: boolean;
  fresh?: boolean;
  background?: boolean;
}): Promise<MachineSummary[]> {
  const heal = options?.heal ?? false;
  const fresh = options?.fresh ?? false;
  const background = options?.background ?? false;
  const next = await listMachines(
    heal || fresh || background ? { heal, fresh, background } : undefined,
  );
  if (next.length > 0 || heal) {
    return next;
  }
  return listMachines({ heal: true, fresh: true });
}

async function loadMachineWork(): Promise<Record<string, MachineWork>> {
  const [quoteData, ticketData] = await Promise.all([
    listQuotes().catch(() => ({ quotes: [] })),
    listAccessibleTickets().catch(() => ({ tickets: [] })),
  ]);
  const next: Record<string, MachineWork> = {};
  for (const quote of quoteData.quotes) {
    if (!quoteIsOpen(quote.status) || !quote.machineId) {
      continue;
    }
    const row = next[quote.machineId] ?? { quotesOpen: 0, ticketsOpen: 0 };
    row.quotesOpen += 1;
    next[quote.machineId] = row;
  }
  for (const ticket of ticketData.tickets) {
    if (!ticketIsOpen(ticket.status) || !ticket.machineId) {
      continue;
    }
    const row = next[ticket.machineId] ?? { quotesOpen: 0, ticketsOpen: 0 };
    row.ticketsOpen += 1;
    next[ticket.machineId] = row;
  }
  return next;
}

function machinePlant(machine: MachineSummary, role?: string) {
  if (machine.company && machine.siteName) {
    return siteLabel({ company: machine.company, name: machine.siteName });
  }
  return role === "staff" ? "No plant — hidden from customers" : "";
}

export function MachinesList({
  initialList,
}: {
  initialList?: MachinesListResponse | null;
}) {
  const router = useRouter();
  const { user, refresh } = useAuth();
  const [adding, setAdding] = useState(false);
  const [machines, setMachines] = useState<MachineSummary[]>(initialList?.machines ?? []);
  const [sites, setSites] = useState<Site[]>([]);
  const [accounts, setAccounts] = useState<CustomerAccount[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(!initialList);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MachineSummary | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [workByMachine, setWorkByMachine] = useState<Record<string, MachineWork>>(
    {},
  );
  const { begin, isCurrent } = useRequestGeneration();

  useEffect(() => {
    const generation = begin();
    const background = reloadKey > 0 || Boolean(initialList);
    const sitesLoad =
      user?.role === "staff"
        ? Promise.all([listSites(), listCustomerAccounts()])
            .then(([nextSites, nextAccounts]) => ({
              sites: nextSites,
              accounts: nextAccounts,
            }))
            .catch(() => ({ sites: [] as Site[], accounts: [] as CustomerAccount[] }))
        : Promise.resolve({
            sites: user?.sites ?? [],
            accounts: [] as CustomerAccount[],
          });
    if (!background) {
      setLoading(true);
    }
    Promise.all([
      loadMachines(background ? { background: true } : undefined),
      sitesLoad,
    ])
      .then(([next, org]) => {
        if (!isCurrent(generation)) {
          return;
        }
        setMachines(next);
        setSites(
          user?.role === "staff"
            ? org.sites
            : sitesForMachineCreate(org.sites, next),
        );
        setAccounts(org.accounts);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!isCurrent(generation)) {
          return;
        }
        setError(errorMessage(cause, "Could not load machines."));
      })
      .finally(() => {
        if (isCurrent(generation)) {
          setLoading(false);
        }
      });
  }, [begin, initialList, isCurrent, reloadKey, user?.role, user?.sites]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        setReloadKey((key) => key + 1);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadMachineWork().then((next) => {
      if (!cancelled) {
        setWorkByMachine(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function refreshFromCache() {
      void loadMachines({ background: true }).then((next) => {
        setMachines(next);
      });
      void loadMachineWork().then(setWorkByMachine);
    }
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        refreshFromCache();
      }
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  const filtered = useMemo(() => {
    return machines.filter((machine) =>
      catalogQueryMatch(query, [
        machine.name,
        machine.company,
        machine.siteName,
        machinePlant(machine, user?.role),
      ]),
    );
  }, [machines, query, user?.role]);

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
    setMenuId(machine.id);
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
      setMenuId(null);
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
        const next = await listMachines({ heal: true, fresh: true });
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
    return (
      <div className="catalog-stack">
        <p className="sr-only" aria-live="polite">
          Loading machines…
        </p>
        <CatalogSkeleton variant="machine" count={3} />
      </div>
    );
  }

  if (error && machines.length === 0) {
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

  const staff = user?.role === "staff";

  return (
    <div className="catalog-stack">
      <div className="catalog-toolbar">
        <CatalogSearch
          id="machine-search"
          label="Search machines"
          value={query}
          onChange={setQuery}
          placeholder="Search name or plant"
        />
        <p className="catalog-count">
          {filtered.length} {filtered.length === 1 ? "machine" : "machines"}
        </p>
        <button
          type="button"
          className="btn-primary catalog-toolbar-action"
          aria-expanded={adding}
          onClick={() => setAdding((open) => !open)}
        >
          {adding ? "Close" : "Add machine"}
        </button>
        {staff ? (
          <Link href="/machines/new" className="btn-primary catalog-toolbar-action">
            Upload pack
          </Link>
        ) : null}
      </div>

      {adding ? (
        <div className="care-card care-form">
          <p className="text-[17px] font-semibold tracking-tight">Add a machine</p>
          <MachineTypeahead
            machines={machines}
            onMachines={setMachines}
            accounts={accounts}
            sites={sites}
            machineId=""
            onMachineId={(id) => {
              setAdding(false);
              router.push(`/machines/${id}`);
            }}
            role={staff ? "staff" : "customer"}
          />
        </div>
      ) : null}

      {error ? (
        <p className="spares-alert rounded-[20px] px-4 py-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {deleteTarget ? (
        <div
          role="dialog"
          aria-labelledby="delete-machine-title"
          className="spares-alert rounded-[24px] p-5"
        >
          <p id="delete-machine-title" className="spares-alert-title text-[17px] font-semibold">
            Delete {deleteTarget.name}?
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#f0c4c0]/80">
            This removes the machine from the list
            {machineHasModel(deleteTarget) ? " and deletes its stored 3D file" : ""}.
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
              className="btn-danger inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-60"
            >
              {deletingId === deleteTarget.id ? "Deleting…" : "Delete machine"}
            </button>
          </div>
        </div>
      ) : null}

      {machines.length === 0 ? (
        <div className="catalog-empty">
          <MachineGlyph />
          <EmptyState
            title="No machines yet"
            message={
              staff
                ? "Add one by name, or upload a pack."
                : "Add one by name, or ask staff if you expected one here."
            }
            action={
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void retry();
                  }}
                  className="btn-soft inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold"
                >
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="btn-primary inline-flex h-11 items-center rounded-full px-4 text-sm font-medium"
                >
                  Add machine
                </button>
                {staff ? (
                  <Link
                    href="/machines/new"
                    className="btn-soft inline-flex h-11 items-center rounded-full px-4 text-sm font-medium"
                  >
                    Upload pack
                  </Link>
                ) : null}
              </div>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="catalog-empty">
          <EmptyState
            title="No matches"
            message="Try a different machine name or plant."
          />
        </div>
      ) : (
        <ul className="catalog-machine-grid">
          {filtered.map((machine) => {
            const open = menuId === machine.id;
            const renaming = editingNameId === machine.id;
            const plant = machinePlant(machine, user?.role);
            const work = workByMachine[machine.id] ?? {
              quotesOpen: 0,
              ticketsOpen: 0,
            };
            return (
              <li key={machine.id} className="catalog-machine-card" data-open={open ? "true" : "false"}>
                <div className="catalog-machine-main">
                  {renaming ? (
                    <>
                      <MachineGlyph />
                      <div className="catalog-machine-copy">
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
                          className="spares-muted text-sm font-medium"
                        >
                          Cancel rename
                        </button>
                      </div>
                    </>
                  ) : (
                    <PrefetchLink
                      href={`/machines/${machine.id}`}
                      className="catalog-machine-hit"
                      warm={() => {
                        seedMachineName(machine.id, machine.name);
                        warmMachineRoute(machine.id);
                      }}
                    >
                      <MachineGlyph />
                      <div className="catalog-machine-copy">
                        <span className="catalog-machine-name">{machine.name}</span>
                        <span className="catalog-machine-meta">
                          {plant}
                          {machineHasModel(machine) ? "" : plant ? " · No 3D" : "No 3D"}
                          {machine.version && machine.version > 1 ? ` · v${machine.version}` : ""}
                        </span>
                      </div>
                      {staff ? null : (
                        <span className="catalog-chevron" aria-hidden="true">
                          ›
                        </span>
                      )}
                    </PrefetchLink>
                  )}
                  {staff ? (
                    <button
                      type="button"
                      className="catalog-overflow"
                      aria-expanded={open}
                      aria-controls={`machine-actions-${machine.id}`}
                      aria-label={`Actions for ${machine.name}`}
                      onClick={() => {
                        setMenuId(open ? null : machine.id);
                      }}
                    >
                      ⋯
                    </button>
                  ) : null}
                </div>
                <div className="catalog-machine-work">
                  <PrefetchLink
                    href={machineTabHref(machine.id, "quotes")}
                    warm={() => {
                      seedMachineName(machine.id, machine.name);
                      warmMachineRoute(machine.id);
                      warmQuotesList();
                    }}
                    className="catalog-machine-work-link"
                    data-active={work.quotesOpen > 0 ? "true" : undefined}
                  >
                    {work.quotesOpen > 0
                      ? `${work.quotesOpen} ${work.quotesOpen === 1 ? "quote" : "quotes"}`
                      : "Quotes"}
                  </PrefetchLink>
                  <PrefetchLink
                    href={machineTabHref(machine.id, "tickets")}
                    warm={() => {
                      seedMachineName(machine.id, machine.name);
                      warmMachineRoute(machine.id);
                    }}
                    className="catalog-machine-work-link"
                    data-active={work.ticketsOpen > 0 ? "true" : undefined}
                  >
                    {work.ticketsOpen > 0
                      ? `${work.ticketsOpen} ${work.ticketsOpen === 1 ? "ticket" : "tickets"}`
                      : "Tickets"}
                  </PrefetchLink>
                  <PrefetchLink
                    href={machineTabHref(machine.id, "manuals")}
                    warm={() => {
                      seedMachineName(machine.id, machine.name);
                      warmMachineRoute(machine.id);
                    }}
                    className="catalog-machine-work-link"
                  >
                    Manuals
                  </PrefetchLink>
                </div>
                {staff && open ? (
                  <div id={`machine-actions-${machine.id}`} className="catalog-machine-actions">
                    <div className="catalog-action-label">
                      <MachineSitePicker
                        accounts={accounts}
                        sites={sites}
                        siteId={machine.siteId ?? ""}
                        disabled={savingId === machine.id}
                        onSiteChange={(nextSiteId) => {
                          void onAssign(machine.id, nextSiteId);
                        }}
                      />
                    </div>
                    <div className="catalog-action-row">
                      {renaming ? null : (
                        <button type="button" onClick={() => startRename(machine)}>
                          Rename
                        </button>
                      )}
                      <Link href={`/machines/new?replace=${machine.id}`}>Replace pack</Link>
                      <button
                        type="button"
                        className="catalog-action-danger"
                        onClick={() => {
                          setDeleteTarget(machine);
                          setError(null);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
