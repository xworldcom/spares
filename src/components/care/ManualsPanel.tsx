"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingState } from "@/components/states/LoadingState";
import { formatDay } from "@/components/quote/quote-format";
import { listManuals, uploadManual } from "@/lib/api/care";
import { errorMessage } from "@/lib/api/errors";
import {
  MANUAL_CATEGORIES,
  MANUAL_CATEGORY_LABELS,
} from "@/lib/care";
import type { ManualCategory, PublicMachineManual } from "@/types";

export function ManualsPanel({ machineId }: { machineId: string }) {
  const { user } = useAuth();
  const staff = user?.role === "staff";
  const [manuals, setManuals] = useState<PublicMachineManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ManualCategory>("operator");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listManuals(machineId)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setManuals(next);
        setError(null);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        setError(errorMessage(cause, "Could not load manuals."));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [machineId, reloadKey]);

  const grouped = useMemo(() => {
    return MANUAL_CATEGORIES.map((key) => ({
      category: key,
      items: manuals.filter((manual) => manual.category === key),
    })).filter((group) => group.items.length > 0);
  }, [manuals]);

  async function onUpload() {
    if (!file || !title.trim()) {
      setError("Add a title and a PDF or Word file.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await uploadManual(machineId, {
        title: title.trim(),
        category,
        file,
      });
      setManuals((current) => [next, ...current]);
      setTitle("");
      setFile(null);
    } catch (cause) {
      setError(errorMessage(cause, "Could not upload that manual."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <LoadingState label="Loading manuals…" />;
  }

  if (error && manuals.length === 0) {
    return (
      <ErrorState
        title="Failed to load manuals"
        message={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <div className="care-stack">
      {staff ? (
        <form
          className="care-card care-form"
          onSubmit={(event) => {
            event.preventDefault();
            void onUpload();
          }}
        >
          <h2>Upload a manual</h2>
          <label className="care-field">
            <span>Title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[16px] outline-none"
              placeholder="Operator handbook"
            />
          </label>
          <label className="care-field">
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as ManualCategory)}
              className="spares-field h-11 w-full rounded-2xl border-0 px-3 text-[15px] outline-none"
            >
              {MANUAL_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {MANUAL_CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="care-field">
            <span>File</span>
            <input
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </label>
          {error ? (
            <p className="text-sm text-[#f0c4c0]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="btn-primary inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60"
          >
            {busy ? "Uploading…" : "Upload manual"}
          </button>
        </form>
      ) : error ? (
        <p className="text-sm text-[#f0c4c0]" role="alert">
          {error}
        </p>
      ) : null}

      {manuals.length === 0 ? (
        <EmptyState
          title="No manuals yet"
          message={
            staff
              ? "Upload a PDF or Word document so the plant can open it from Care."
              : "Staff have not added manuals for this machine yet."
          }
        />
      ) : (
        grouped.map((group) => (
          <section key={group.category} className="care-card">
            <header className="care-card-head">
              <h2>{MANUAL_CATEGORY_LABELS[group.category]}</h2>
              <span className="spares-muted text-sm">{group.items.length}</span>
            </header>
            <ul className="care-list">
              {group.items.map((manual) => (
                <li key={manual.id}>
                  <a
                    href={manual.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="care-row"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="care-row-title">{manual.title}</p>
                      <p className="spares-muted truncate text-sm">
                        {manual.originalFileName}
                        {` · ${formatDay(manual.uploadedAt)}`}
                      </p>
                    </div>
                    <span className="spares-muted text-sm font-medium">Open</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
