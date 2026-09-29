"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { ACCESS_INQUIRY_STATUSES, accessInquiryStatusLabel } from "@/lib/access-inquiry";
import { errorMessage, isForbidden } from "@/lib/api/errors";
import {
  getPlatformInquiry,
  updatePlatformInquiryStatus,
  type PlatformInquiryRow,
} from "@/lib/api/platform-inquiries";

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function PlatformInquiryDetail() {
  const params = useParams<{ inquiryId: string }>();
  const inquiryId = params.inquiryId;
  const [inquiry, setInquiry] = useState<PlatformInquiryRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getPlatformInquiry(inquiryId)
      .then((response) => {
        setInquiry(response.inquiry);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (isForbidden(cause)) {
          setError("Only the platform owner can review inquiries.");
        } else {
          setError(errorMessage(cause, "Could not load inquiry."));
        }
        setLoading(false);
      });
  }, [inquiryId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(status: string) {
    setSaving(true);
    try {
      const response = await updatePlatformInquiryStatus(inquiryId, status);
      setInquiry(response.inquiry);
    } catch (cause) {
      setError(errorMessage(cause, "Could not update status."));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading inquiry…" />;
  }

  if (error || !inquiry) {
    return (
      <ErrorState
        title="Inquiry unavailable"
        message={error ?? "Not found"}
        onRetry={load}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          className="text-sm text-muted hover:underline"
          href="/staff/platform/inquiries"
        >
          ← Inquiries
        </Link>
        <h1 className="page-title mt-2">{inquiry.companyName}</h1>
        <p className="spares-muted mt-2 text-[15px]">
          Submitted {formatWhen(inquiry.createdAt)} · {inquiry.customerTypeLabel}
        </p>
      </div>

      <div className="spares-surface rounded-[24px] p-4 sm:p-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="spares-muted text-xs uppercase tracking-wide">Contact</dt>
            <dd className="mt-1 font-medium">{inquiry.fullName}</dd>
          </div>
          <div>
            <dt className="spares-muted text-xs uppercase tracking-wide">Email</dt>
            <dd className="mt-1">
              <a className="underline" href={`mailto:${inquiry.workEmail}`}>
                {inquiry.workEmail}
              </a>
            </dd>
          </div>
          <div>
            <dt className="spares-muted text-xs uppercase tracking-wide">Phone</dt>
            <dd className="mt-1">{inquiry.phone}</dd>
          </div>
          <div>
            <dt className="spares-muted text-xs uppercase tracking-wide">Role</dt>
            <dd className="mt-1">{inquiry.roleTitle}</dd>
          </div>
          {inquiry.website ? (
            <div className="sm:col-span-2">
              <dt className="spares-muted text-xs uppercase tracking-wide">Website</dt>
              <dd className="mt-1 break-all">
                <a className="underline" href={inquiry.website} target="_blank" rel="noreferrer">
                  {inquiry.website}
                </a>
              </dd>
            </div>
          ) : null}
          {inquiry.scaleNotes ? (
            <div className="sm:col-span-2">
              <dt className="spares-muted text-xs uppercase tracking-wide">Scale</dt>
              <dd className="mt-1 whitespace-pre-wrap">{inquiry.scaleNotes}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-5 border-t border-white/8 pt-5">
          <p className="spares-muted text-xs uppercase tracking-wide">Message</p>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{inquiry.message}</p>
        </div>

        {inquiry.referralNotes ? (
          <div className="mt-4">
            <p className="spares-muted text-xs uppercase tracking-wide">How they heard about us</p>
            <p className="mt-2 whitespace-pre-wrap">{inquiry.referralNotes}</p>
          </div>
        ) : null}
      </div>

      <div className="spares-surface rounded-[24px] p-4 sm:p-5">
        <label className="block">
          <span className="spares-muted text-xs font-medium uppercase tracking-wide">Status</span>
          <select
            className="login-input mt-2 max-w-xs"
            disabled={saving}
            value={inquiry.status}
            onChange={(event) => void handleStatusChange(event.target.value)}
          >
            {ACCESS_INQUIRY_STATUSES.map((status) => (
              <option key={status} value={status}>
                {accessInquiryStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <p className="spares-muted mt-3 text-sm">
          Status does not create logins or send email.
        </p>
      </div>
    </div>
  );
}
