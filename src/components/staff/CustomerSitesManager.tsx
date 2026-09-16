"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { CatalogSkeleton } from "@/components/catalog/CatalogSkeleton";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import {
  createSite,
  deleteCustomerAccount,
  deleteSite,
  getCustomerAccountDetail,
  updateCustomerAccount,
  updateSite,
} from "@/lib/api/auth";
import {
  deletePlatformDirectoryCustomer,
  deletePlatformDirectorySite,
  getPlatformDirectoryCustomer,
  updatePlatformDirectoryCustomer,
} from "@/lib/api/platform-directory";
import { errorMessage } from "@/lib/api/errors";
import type { CustomerAccount, Site } from "@/lib/api/types";

type SiteRow = Site & { machineCount: number };

export function CustomerSitesManager({ customerId }: { customerId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const platformScope = Boolean(user?.platformOwner);
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [accountName, setAccountName] = useState("");
  const [newSiteName, setNewSiteName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [editNames, setEditNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadDetail() {
      if (platformScope) {
        const data = await getPlatformDirectoryCustomer(customerId);
        if (cancelled) {
          return;
        }
        setAccount(data.account);
        setAccountName(data.account.name);
        setSites(data.sites);
        setEditNames(Object.fromEntries(data.sites.map((site) => [site.id, site.name])));
        setHostName(data.hostName);
        setHostId(data.hostId);
        setError(null);
        setLoading(false);
        return;
      }
      const data = await getCustomerAccountDetail(customerId);
      if (cancelled) {
        return;
      }
      setAccount(data.account);
      setAccountName(data.account.name);
      setSites(data.sites);
      setEditNames(Object.fromEntries(data.sites.map((site) => [site.id, site.name])));
      setHostName(null);
      setHostId(null);
      setError(null);
      setLoading(false);
    }
    void loadDetail().catch((cause: unknown) => {
      if (cancelled) {
        return;
      }
      setError(errorMessage(cause, "Could not load this customer."));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [customerId, retryKey, platformScope]);

  async function refresh() {
    if (platformScope) {
      const data = await getPlatformDirectoryCustomer(customerId);
      setAccount(data.account);
      setAccountName(data.account.name);
      setSites(data.sites);
      setHostName(data.hostName);
      setHostId(data.hostId);
      setEditNames(Object.fromEntries(data.sites.map((site) => [site.id, site.name])));
      return;
    }
    const data = await getCustomerAccountDetail(customerId);
    setAccount(data.account);
    setAccountName(data.account.name);
    setSites(data.sites);
    setEditNames(Object.fromEntries(data.sites.map((site) => [site.id, site.name])));
  }

  async function saveAccountName() {
    if (!account) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const next = platformScope
        ? await updatePlatformDirectoryCustomer(account.id, accountName.trim())
        : await updateCustomerAccount(account.id, accountName.trim());
      setAccount(next);
    } catch (cause) {
      setError(errorMessage(cause, "Could not save customer name."));
    } finally {
      setSubmitting(false);
    }
  }

  async function addSite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createSite(customerId, newSiteName.trim());
      setNewSiteName("");
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not add that site."));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveSite(siteId: string) {
    const name = editNames[siteId]?.trim();
    if (!name) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateSite(siteId, { name });
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not save that site."));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeSite(siteId: string, siteName: string, machineCount: number) {
    const blockedHint =
      machineCount > 0
        ? `\n\nThis site still has ${machineCount} machine${machineCount === 1 ? "" : "s"}. Move or remove them first.`
        : "";
    if (
      !window.confirm(
        `Delete site “${siteName}”?${blockedHint || " People lose access to this site."}`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (platformScope) {
        await deletePlatformDirectorySite(siteId);
      } else {
        await deleteSite(siteId);
      }
      await refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not delete that site."));
    } finally {
      setSubmitting(false);
    }
  }

  async function removeCustomer() {
    if (!account) {
      return;
    }
    const siteHint =
      sites.length > 0
        ? `\n\nThis customer still has ${sites.length} site${sites.length === 1 ? "" : "s"}. Delete those sites first.`
        : "";
    if (
      !window.confirm(
        `Delete customer “${account.name}”?${siteHint || " This cannot be undone on Preview."}`,
      )
    ) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (platformScope) {
        await deletePlatformDirectoryCustomer(account.id);
      } else {
        await deleteCustomerAccount(account.id);
      }
      router.push("/staff/directory?type=customer");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not delete that customer."));
      setSubmitting(false);
    }
  }

  if (loading) {
    return <CatalogSkeleton variant="table" count={3} />;
  }

  if (error && !account) {
    return (
      <ErrorState
        title="Customer not found"
        message={error}
        onRetry={() => {
          setLoading(true);
          setRetryKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <section className="catalog-stack">
      <div className="catalog-page-intro catalog-page-intro-split">
        <div>
          <p className="catalog-breadcrumb">
            <Link href="/staff/directory?type=customer">Directory</Link>
            <span aria-hidden="true"> / </span>
            <span>{account?.name}</span>
          </p>
          <h1>{account?.name}</h1>
          <p>
            Sites under this customer. Machines belong to exactly one site.
            {platformScope && hostName && hostId ? (
              <>
                {" "}
                Host{" "}
                <Link href={`/staff/platform/${encodeURIComponent(hostId)}`} className="hover:underline">
                  {hostName}
                </Link>
                .
              </>
            ) : null}
          </p>
        </div>
      </div>
      <div className="catalog-create">
        <label className="block max-w-xl text-sm font-medium">
          Customer name
          <div className="mt-1.5 flex flex-wrap gap-2">
            <input
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              className="spares-field h-11 min-w-[16rem] flex-1 rounded-2xl border-0 px-3 text-[15px] outline-none"
            />
            <button
              type="button"
              className="btn-soft"
              disabled={submitting}
              onClick={() => void saveAccountName()}
            >
              Save name
            </button>
          </div>
        </label>
      </div>
      <form onSubmit={(event) => void addSite(event)} className="catalog-create">
        <div className="catalog-create-copy">
          <h2>Add site</h2>
          <p>Location name only — customer is already set.</p>
        </div>
        <div className="catalog-create-grid">
          <label className="block text-sm font-medium md:col-span-2">
            Site name
            <input
              value={newSiteName}
              onChange={(event) => setNewSiteName(event.target.value)}
              required
              placeholder="Fort Worth"
              className="spares-field mt-1.5 h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            />
          </label>
        </div>
        <div className="catalog-create-actions">
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary inline-flex h-12 items-center justify-center rounded-full px-5 text-[16px] font-semibold disabled:opacity-60"
          >
            {submitting ? "Adding…" : "Add site"}
          </button>
        </div>
      </form>
      {error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}
      {sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          message="Add the first site for this customer, then assign machines and people."
        />
      ) : (
        <div className="catalog-table-wrap">
          <table className="catalog-table">
            <thead>
              <tr>
                <th scope="col">Site</th>
                <th scope="col">Machines</th>
                <th scope="col" className="catalog-table-actions">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => (
                <tr key={site.id}>
                  <td>
                    <input
                      value={editNames[site.id] ?? site.name}
                      disabled={submitting}
                      onChange={(event) =>
                        setEditNames((current) => ({
                          ...current,
                          [site.id]: event.target.value,
                        }))
                      }
                      className="spares-field h-11 w-full max-w-md rounded-2xl border-0 px-3 text-[15px] outline-none"
                      aria-label={`Site name for ${site.name}`}
                    />
                  </td>
                  <td>{site.machineCount}</td>
                  <td className="catalog-table-actions">
                    <div className="catalog-table-action-row">
                      <button
                        type="button"
                        className="btn-soft"
                        disabled={submitting}
                        onClick={() => void saveSite(site.id)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-soft text-[#f0c4c0]"
                        disabled={submitting}
                        onClick={() => void removeSite(site.id, site.name, site.machineCount)}
                      >
                        Delete site
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="border-t border-white/10 pt-6 mt-8">
        <h2 className="text-lg font-semibold text-[#f0c4c0]">Delete customer</h2>
        <p className="text-muted mt-1 mb-4 text-sm">
          Removes this customer company from the directory. Delete every site first. People and
          machines are unchanged until you clean them up separately.
        </p>
        <button
          type="button"
          className="btn-soft text-[#f0c4c0]"
          disabled={submitting}
          onClick={() => void removeCustomer()}
        >
          Delete customer
        </button>
      </section>
    </section>
  );
}
