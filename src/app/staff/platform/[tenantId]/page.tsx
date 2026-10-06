"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { StaffTeamPanel } from "@/components/staff/StaffTeamPanel";
import { apiFetch } from "@/lib/api/client";
import { deletePlatformTenant } from "@/lib/api/platform-directory";
import { errorMessage } from "@/lib/api/errors";
import { SsoAutorouteSelector } from "@/components/staff/SsoAutorouteSelector";
import {
  formatSsoDomains,
  formatSsoSummary,
  formatSsoTenantIds,
  tenantSsoAutorouteEnabled,
} from "@/lib/auth/sso-domain";
import type { HostTicketMailbox } from "@/lib/care-ticket-email";
import type { Tenant } from "@/types";

type DeploymentDetail = {
  deployment: {
    tenant: Tenant;
    kind: "host" | "satellite";
    inactive: boolean;
    size: {
      staffUsers: number;
      customerPeople: number;
      customers: number;
      sites: number;
      machines: number;
      openTickets: number;
      openQuotes: number;
    };
    usage: {
      label: string;
      windowDays: number;
      machinesCreated: number;
      quotesCreated: number;
      ticketsCreated: number;
      usageRowUpdates: number;
    };
  };
  staff: Array<{ id: string; email: string; tenantId: string | null }>;
  ticketMailbox: HostTicketMailbox | null;
};

export default function PlatformTenantDetailPage() {
  return (
    <RequireAuth role="staff">
      <TenantDetail />
    </RequireAuth>
  );
}

function TenantDetail() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useParams();
  const tenantId = typeof params.tenantId === "string" ? params.tenantId : "";
  const [detail, setDetail] = useState<DeploymentDetail | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [ssoDomains, setSsoDomains] = useState("");
  const [ssoTenantIds, setSsoTenantIds] = useState("");
  const [ssoAutoroute, setSsoAutoroute] = useState(false);
  const [ticketEmailDisplay, setTicketEmailDisplay] = useState("");
  const [ticketMailbox, setTicketMailbox] = useState<HostTicketMailbox | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketNotice, setTicketNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.platformOwner || !tenantId) {
      setForbidden(true);
      return;
    }
    try {
      const data = await apiFetch<DeploymentDetail>(
        `/api/platform/deployments/${encodeURIComponent(tenantId)}`,
      );
      setDetail(data);
      setDisplayName(data.deployment.tenant.name);
      setSsoDomains(formatSsoDomains(data.deployment.tenant.ssoDomains));
      setSsoTenantIds(formatSsoTenantIds(data.deployment.tenant.ssoTenantIds));
      setSsoAutoroute(tenantSsoAutorouteEnabled(data.deployment.tenant));
      setTicketEmailDisplay(data.deployment.tenant.ticketEmailDisplay ?? "");
      setTicketMailbox(data.ticketMailbox);
      setForbidden(false);
      setError(null);
    } catch (cause) {
      if (cause instanceof Error && cause.message.includes("403")) {
        setForbidden(true);
      } else {
        setError(cause instanceof Error ? cause.message : "Could not load tenant");
      }
    }
  }, [tenantId, user?.platformOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSsoDomains() {
    if (!tenantId) {
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        body: JSON.stringify({ ssoDomains, ssoTenantIds, ssoAutoroute }),
      });
      setNotice("SSO settings updated.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveTicketEmail() {
    if (!tenantId) {
      return;
    }
    setBusy(true);
    setTicketNotice(null);
    setTicketError(null);
    try {
      await apiFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        body: JSON.stringify({ ticketEmailDisplay }),
      });
      setTicketNotice("Care ticket email updated.");
      await load();
    } catch (cause) {
      setTicketError(cause instanceof Error ? cause.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyInboundAddress() {
    const address = ticketMailbox?.inboundAddress;
    if (!address) {
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      setTicketNotice("Copied forward-to address.");
      setTicketError(null);
    } catch {
      setTicketError("Could not copy the forward-to address.");
    }
  }

  async function saveName() {
    if (!tenantId) {
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: displayName }),
      });
      setNotice("Display name updated.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteHost() {
    if (!tenantId || !detail) {
      return;
    }
    if (detail.deployment.kind === "host") {
      return;
    }
    const { size } = detail.deployment;
    const childSummary = [
      size.staffUsers > 0 ? `${size.staffUsers} staff` : null,
      size.customerPeople > 0 ? `${size.customerPeople} people` : null,
      size.customers > 0 ? `${size.customers} customers` : null,
      size.sites > 0 ? `${size.sites} sites` : null,
      size.machines > 0 ? `${size.machines} machines` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const blockedHint = childSummary
      ? `\n\nThis host still has ${childSummary}. Remove those records first.`
      : "";
    if (
      !window.confirm(
        `Delete host “${detail.deployment.tenant.name}”?${blockedHint || " This permanently removes the satellite host."}`,
      )
    ) {
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await deletePlatformTenant(tenantId);
      router.push("/staff/platform");
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Could not delete this host."));
      setBusy(false);
    }
  }

  async function toggleInactive() {
    if (!tenantId || !detail) {
      return;
    }
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      await apiFetch(`/api/platform/tenants/${encodeURIComponent(tenantId)}`, {
        method: "PATCH",
        body: JSON.stringify({ inactive: !detail.deployment.inactive }),
      });
      setNotice(detail.deployment.inactive ? "Host reactivated." : "Host suspended.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user?.platformOwner || forbidden) {
    return (
      <main className="page-shell">
        <h1 className="page-title">Host</h1>
        <p className="text-muted">Platform owner access is required.</p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="page-shell">
        <p className="text-muted">{error ?? "Loading…"}</p>
      </main>
    );
  }

  const { deployment } = detail;
  const inboundDomain = ticketMailbox?.inboundAddress.split("@")[1] ?? "tickets.oee360.com";
  const framedDns = [
    "These DNS records are for a later From address. They are not active.",
    "",
    "SPF TXT on the display domain. Merge this include into the existing SPF record. Do not publish a second SPF.",
    `v=spf1 include:${inboundDomain} ~all`,
    "",
    "DKIM TXT. OEE360 will give you the selector and value before From goes live. Do not publish a guessed key.",
    "<selector>._domainkey.<display-domain> TXT <value from OEE360>",
  ].join("\n");

  return (
    <main className="page-shell">
      <p className="mb-4">
        <Link className="text-sm text-muted hover:underline" href="/staff/platform">
          ← Hosts
        </Link>
      </p>

      <h1 className="page-title">{deployment.tenant.name}</h1>
      <p className="text-muted font-mono text-sm">{deployment.tenant.id}</p>
      <p className="text-muted text-sm">
        Handle <code>{deployment.tenant.slug}</code> ·{" "}
        {deployment.kind === "host" ? "Soft Launch Host" : "Satellite"} · Created{" "}
        {new Date(deployment.tenant.createdAt).toLocaleString()}
        {deployment.inactive ? " · Suspended" : ""}
      </p>
      {formatSsoSummary(deployment.tenant) ? (
        <p className="text-muted text-sm">{formatSsoSummary(deployment.tenant)}</p>
      ) : null}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Size (catalog)</h2>
          <ul className="stack gap-2 text-sm">
            <li>Staff users: {deployment.size.staffUsers}</li>
            <li>Customer people (contacts): {deployment.size.customerPeople}</li>
            <li>Customer accounts: {deployment.size.customers}</li>
            <li>Sites: {deployment.size.sites}</li>
            <li>Machines: {deployment.size.machines}</li>
            <li>Open Care tickets: {deployment.size.openTickets}</li>
            <li>Open quotes: {deployment.size.openQuotes}</li>
          </ul>
        </section>

        <section className="card p-4">
          <h2 className="text-lg font-semibold mb-3">Usage</h2>
          <p className="text-sm text-muted mb-3">{deployment.usage.label}</p>
          <ul className="stack gap-2 text-sm">
            <li>Machines added: {deployment.usage.machinesCreated}</li>
            <li>Quotes created: {deployment.usage.quotesCreated}</li>
            <li>Tickets opened: {deployment.usage.ticketsCreated}</li>
            <li>Machine usage updates: {deployment.usage.usageRowUpdates}</li>
          </ul>
        </section>
      </div>

      <section className="card p-4 mt-6 max-w-lg">
        <h2 className="text-lg font-semibold mb-3">Display name</h2>
        <div className="flex flex-wrap gap-2">
          <input
            className="spares-field h-12 flex-1 min-w-[12rem] rounded-2xl border-0 px-4 text-[16px] outline-none"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <button className="btn-primary" type="button" disabled={busy} onClick={() => void saveName()}>
            Save
          </button>
        </div>
        <button
          className="btn-secondary mt-4 text-sm"
          type="button"
          disabled={busy || deployment.kind === "host"}
          onClick={() => void toggleInactive()}
        >
          {deployment.inactive ? "Reactivate host" : "Suspend host"}
        </button>
        {deployment.kind === "host" ? (
          <p className="text-xs text-muted mt-2">
            The Soft Launch host cannot be suspended or deleted.
          </p>
        ) : null}
      </section>

      <section className="card p-4 mt-6 max-w-lg">
        <h2 className="text-lg font-semibold mb-1">Care ticket email</h2>
        <p className="text-sm font-medium mb-3">
          {ticketMailbox?.live ? "Live" : "Framed — not live"}
        </p>
        <p className="text-sm text-muted mb-4">
          Customers write to the display address. Forward that mailbox to the inbound address.
          This frame does not receive mail.
        </p>
        <label className="stack gap-1 mb-4" htmlFor="host-ticket-email-display">
          <span className="text-sm font-medium">Display ticket email</span>
          <input
            id="host-ticket-email-display"
            className="spares-field h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            value={ticketEmailDisplay}
            onChange={(e) => setTicketEmailDisplay(e.target.value)}
            placeholder="cases@shape.com"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="stack gap-1 mb-4">
          <label className="text-sm font-medium" htmlFor="host-ticket-inbound">
            Forward-to address
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id="host-ticket-inbound"
              className="spares-field h-12 flex-1 min-w-[12rem] rounded-2xl border-0 px-4 font-mono text-[16px] outline-none"
              value={ticketMailbox?.inboundAddress ?? ""}
              readOnly
            />
            <button
              className="btn-secondary"
              type="button"
              disabled={busy || !ticketMailbox?.inboundAddress}
              onClick={() => void copyInboundAddress()}
            >
              Copy
            </button>
          </div>
        </div>
        <pre className="text-xs font-mono whitespace-pre-wrap rounded-2xl bg-black/20 p-3 mb-4">
          {framedDns}
        </pre>
        <p className="text-sm mb-4">
          Complete live inbound + From-domain (SPF/DKIM) once we go live with paying customers.
        </p>
        <button
          className="btn-primary"
          type="button"
          disabled={busy}
          onClick={() => void saveTicketEmail()}
        >
          Save
        </button>
        {ticketError ? <p className="text-danger mt-2">{ticketError}</p> : null}
        {ticketNotice ? <p className="text-sm text-muted mt-2">{ticketNotice}</p> : null}
      </section>

      <section className="card p-4 mt-6 max-w-lg">
        <h2 className="text-lg font-semibold mb-3">Microsoft SSO</h2>
        <p className="text-sm text-muted mb-3">
          Work domain and Entra tenant ID. Autoroute creates staff on new Microsoft sign-ins.
          Existing logins stay on their host.
        </p>
        <label className="stack gap-1 mb-4">
          <span className="text-sm font-medium">Work domain</span>
          <input
            id="host-sso-domains"
            className="spares-field h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            value={ssoDomains}
            onChange={(e) => setSsoDomains(e.target.value)}
            placeholder="shape.com"
            autoComplete="off"
          />
        </label>
        <label className="stack gap-1 mb-4">
          <span className="text-sm font-medium">Entra tenant ID</span>
          <input
            id="host-sso-tenant-ids"
            className="spares-field h-12 w-full rounded-2xl border-0 px-4 text-[16px] outline-none"
            value={ssoTenantIds}
            onChange={(e) => setSsoTenantIds(e.target.value)}
            placeholder="11111111-2222-3333-4444-555555555555"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-sm text-muted">
            Entra admin center, Overview, Tenant ID. Autoroute needs a domain and a tenant ID.
          </p>
        </label>
        <SsoAutorouteSelector
          value={ssoAutoroute}
          onChange={setSsoAutoroute}
          disabled={busy}
        />
        <button
          className="btn-primary mt-4"
          type="button"
          disabled={busy}
          onClick={() => void saveSsoDomains()}
        >
          Save
        </button>
        {error ? <p className="text-danger mt-2">{error}</p> : null}
        {notice ? <p className="text-sm text-muted mt-2">{notice}</p> : null}
      </section>

      {deployment.kind === "satellite" ? (
        <section className="card p-4 mt-6 max-w-lg border border-[#f0c4c0]/20">
          <h2 className="text-lg font-semibold text-[#f0c4c0] mb-2">Delete host</h2>
          <p className="text-sm text-muted mb-4">
            Permanently removes this satellite host from the platform. Delete every staff login,
            customer, site, and machine on this host first. Open quotes and care tickets block
            deletion until they are closed or removed.
          </p>
          <button
            type="button"
            className="btn-soft text-[#f0c4c0]"
            disabled={busy}
            onClick={() => void deleteHost()}
          >
            Delete host
          </button>
        </section>
      ) : null}

      <section className="mt-8">
        <StaffTeamPanel
          fixedTenantId={tenantId}
          onCreated={() => void load()}
        />
      </section>
    </main>
  );
}
