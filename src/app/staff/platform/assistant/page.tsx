"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import { errorMessage, isForbidden } from "@/lib/api/errors";
import type { AssistantModelOption } from "@/lib/assistant/models";

type AssistantSettingsResponse = {
  enabled: boolean;
  model: string;
  models: AssistantModelOption[];
};

export default function PlatformAssistantSettingsPage() {
  return (
    <RequireAuth role="staff">
      <PlatformAssistantSettings />
    </RequireAuth>
  );
}

function PlatformAssistantSettings() {
  const router = useRouter();
  const { user } = useAuth();
  const [settings, setSettings] = useState<AssistantSettingsResponse | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!user?.platformOwner) {
      setForbidden(true);
      setLoading(false);
      return;
    }
    try {
      const data = await apiFetch<AssistantSettingsResponse>("/api/platform/assistant-settings");
      setSettings(data);
      setEnabled(data.enabled);
      setModel(data.model);
      setForbidden(false);
      setError(null);
    } catch (cause) {
      if (isForbidden(cause)) {
        setForbidden(true);
      } else {
        setError(errorMessage(cause, "Could not load AI settings"));
      }
    } finally {
      setLoading(false);
    }
  }, [user?.platformOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const data = await apiFetch<AssistantSettingsResponse>("/api/platform/assistant-settings", {
        method: "PATCH",
        body: JSON.stringify({ enabled, model }),
      });
      setSettings(data);
      setEnabled(data.enabled);
      setModel(data.model);
      setSaved(true);
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  if (!user?.platformOwner || forbidden) {
    return (
      <main className="page-shell">
        <h1 className="page-title">AI</h1>
        <p className="text-muted">Platform owner access is required.</p>
      </main>
    );
  }

  const selected = settings?.models.find((row) => row.id === model);

  return (
    <main className="page-shell max-w-2xl">
      <div className="mb-6">
        <Link className="text-sm text-muted hover:underline" href="/staff/platform">
          ← Hosts
        </Link>
        <h1 className="page-title mt-3">AI</h1>
        <p className="text-muted mt-1">
          When this is on, AI joins Care ticket and quote chats as its own participant — labeled
          AI, not staff. It can read that machine&apos;s BOM, manuals, and drawings, and look at
          photos or short video someone sends. It hands the thread to people if it cannot help
          or the user asks to escalate.
        </p>
      </div>

      {loading ? <p className="text-muted">Loading…</p> : null}
      {error ? (
        <p className="text-danger mb-3" role="alert">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p className="text-sm text-emerald-400/90 mb-3" role="status">
          Saved. New chat messages pick this up immediately.
        </p>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/20"
            checked={enabled}
            disabled={saving}
            onChange={(event) => {
              setEnabled(event.target.checked);
              setSaved(false);
            }}
          />
          <span>
            <span className="font-medium">Enable AI in chat</span>
            <span className="block text-sm text-muted mt-1">
              Off by default. Platform-wide — every host on this install. AI replies when a
              customer is the latest speaker, or when staff mention AI. If a technician jumps in,
              it stays quiet. Staff can also turn AI off for one conversation. After it escalates
              a thread, it stays quiet there until staff turn it back on.
            </span>
          </span>
        </label>

        <div>
          <label className="block font-medium mb-2" htmlFor="assistant-model">
            Model
          </label>
          <select
            id="assistant-model"
            className="spares-field h-11 w-full rounded-2xl border-0 px-4 text-[15px] outline-none"
            value={model}
            disabled={saving || !settings}
            onChange={(event) => {
              setModel(event.target.value);
              setSaved(false);
            }}
          >
            {(settings?.models ?? []).map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
          {selected ? <p className="text-sm text-muted mt-2">{selected.hint}</p> : null}
        </div>

        <p className="text-sm text-muted">
          Models run through Vercel AI Gateway. On Vercel that uses OIDC. Locally set{" "}
          <code className="text-xs">AI_GATEWAY_API_KEY</code> if you want replies on your machine.
        </p>

        <button
          type="button"
          className="btn-primary text-sm"
          disabled={saving || !model}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </section>
    </main>
  );
}
