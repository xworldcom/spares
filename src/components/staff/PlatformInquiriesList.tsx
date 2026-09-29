"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { errorMessage, isForbidden } from "@/lib/api/errors";
import {
  listPlatformInquiries,
  type PlatformInquiryRow,
} from "@/lib/api/platform-inquiries";

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function PlatformInquiriesList() {
  const [rows, setRows] = useState<PlatformInquiryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"newest" | "company">("newest");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listPlatformInquiries()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setRows(response.inquiries);
        setError(null);
        setForbidden(false);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        if (isForbidden(cause)) {
          setForbidden(true);
        } else {
          setError(errorMessage(cause, "Could not load inquiries."));
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = rows;
    if (needle) {
      list = list.filter((row) =>
        [row.companyName, row.fullName, row.workEmail, row.statusLabel]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    const sorted = [...list];
    if (sort === "company") {
      sorted.sort((a, b) => a.companyName.localeCompare(b.companyName));
    }
    return sorted;
  }, [query, rows, sort]);

  if (loading) {
    return <LoadingState label="Loading inquiries…" />;
  }

  if (forbidden) {
    return (
      <EmptyState
        title="Platform owner only"
        message="Platform owner access is required."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load inquiries"
        message={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="block min-w-0 flex-1">
          <span className="spares-muted text-xs font-medium uppercase tracking-wide">Search</span>
          <input
            className="login-input mt-1"
            placeholder="Company, contact, email…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="block sm:w-44">
          <span className="spares-muted text-xs font-medium uppercase tracking-wide">Sort</span>
          <select
            className="login-input mt-1"
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            <option value="newest">Newest first</option>
            <option value="company">Company A–Z</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No inquiries yet"
          message="Request-access forms show up here."
        />
      ) : (
        <div className="overflow-x-auto rounded-[20px] border border-white/8">
          <table className="min-w-full text-left text-sm">
            <thead className="spares-muted border-b border-white/8 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-3 font-medium">Company</th>
                <th className="px-3 py-3 font-medium">Contact</th>
                <th className="px-3 py-3 font-medium">Email</th>
                <th className="px-3 py-3 font-medium">Submitted</th>
                <th className="px-3 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-white/6 last:border-0">
                  <td className="px-3 py-3 font-medium">
                    <Link
                      className="hover:underline"
                      href={`/staff/platform/inquiries/${encodeURIComponent(row.id)}`}
                    >
                      {row.companyName}
                    </Link>
                  </td>
                  <td className="px-3 py-3">{row.fullName}</td>
                  <td className="spares-muted px-3 py-3">{row.workEmail}</td>
                  <td className="spares-muted px-3 py-3 whitespace-nowrap">
                    {formatWhen(row.createdAt)}
                  </td>
                  <td className="px-3 py-3">{row.statusLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
