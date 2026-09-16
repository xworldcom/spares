"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { useAuth } from "@/components/auth/AuthProvider";
import { apiFetch } from "@/lib/api/client";
import { errorMessage, isForbidden } from "@/lib/api/errors";

type SignInSettingsResponse = {
  passwordLoginEnabled: boolean;
  passwordLoginStoredEnabled: boolean;
  passwordLoginEnvOverride: "force-off" | "force-on" | null;
  microsoftSignInEnabled: boolean;
};

export default function PlatformSignInSettingsPage() {
  return (
    <RequireAuth role="staff">
      <PlatformSignInSettings />
    </RequireAuth>
  );
}

function PlatformSignInSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SignInSettingsResponse | null>(null);
  const [allowPassword, setAllowPassword] = useState(true);
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
      const data = await apiFetch<SignInSettingsResponse>("/api/platform/sign-in-settings");
      setSettings(data);
      setAllowPassword(data.passwordLoginStoredEnabled);
      setForbidden(false);
      setError(null);
    } catch (cause) {
      if (isForbidden(cause)) {
        setForbidden(true);
      } else {
        setError(errorMessage(cause, "Could not load sign-in settings"));
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
      const data = await apiFetch<SignInSettingsResponse>("/api/platform/sign-in-settings", {
        method: "PATCH",
        body: JSON.stringify({ passwordLoginEnabled: allowPassword }),
      });
      setSettings(data);
      setAllowPassword(data.passwordLoginStoredEnabled);
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause, "Save failed"));
    } finally {
      setSaving(false);
    }
  }

  if (!user?.platformOwner || forbidden) {
    return (
      <main className="page-shell">
        <h1 className="page-title">Sign-in</h1>
        <p className="text-muted">Platform owner access is required.</p>
      </main>
    );
  }

  const envLocked = settings?.passwordLoginEnvOverride != null;
  const effective = settings?.passwordLoginEnabled ?? allowPassword;

  return (
    <main className="page-shell max-w-2xl">
      <div className="mb-6">
        <Link className="text-sm text-muted hover:underline" href="/staff/platform">
          ← Hosts
        </Link>
        <h1 className="page-title mt-3">Sign-in</h1>
        <p className="text-muted mt-1">
          Control how people reach OEE360. Microsoft SSO stays available when Azure is
          configured, independent of this toggle.
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
          Saved. The login page updates immediately.
        </p>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-white/20"
            checked={allowPassword}
            disabled={envLocked || saving}
            onChange={(event) => {
              setAllowPassword(event.target.checked);
              setSaved(false);
            }}
          />
          <span>
            <span className="font-medium">Allow email &amp; password sign-in</span>
            <span className="block text-sm text-muted mt-1">
              When off, the login page hides email and password and only shows Microsoft
              sign-in (if SSO is configured). Turn this off for Microsoft-only access; leave
              it on if you want both options.
            </span>
          </span>
        </label>

        {envLocked ? (
          <p className="text-sm text-amber-400/90" role="status">
            Vercel env <code className="text-xs">PASSWORD_LOGIN</code> is overriding this
            setting (
            {settings?.passwordLoginEnvOverride === "force-off"
              ? "passwords forced off"
              : "passwords forced on"}
            ). Remove or change that env var to control sign-in from here.
          </p>
        ) : null}

        <p className="text-sm text-muted">
          Effective now:{" "}
          {effective
            ? "email/password and Microsoft (if configured)"
            : settings?.microsoftSignInEnabled
              ? "Microsoft SSO only"
              : "no sign-in method — configure Microsoft SSO or re-enable passwords"}
        </p>

        <button
          type="button"
          className="btn-primary text-sm"
          disabled={saving || envLocked}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </section>
    </main>
  );
}
