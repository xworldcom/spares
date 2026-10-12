"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { submitBugReport } from "@/lib/api/bugs";
import { errorMessage } from "@/lib/api/errors";
import { BUG_REPORT_ACK_MS } from "@/lib/bug-report/ack";
import { buildClientLogText } from "@/lib/bug-report/client-logs";
import {
  capturePageJpegBase64,
  waitTwoAnimationFrames,
} from "@/lib/bug-report/screenshot";
import { useHydrated } from "@/lib/use-hydrated";

type Status = "idle" | "sent" | "error";

function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        fill="currentColor"
        d="M7 3h2v18H7zm3 1.2 10 4.3-10 4.3V4.2z"
      />
    </svg>
  );
}

export function BugReportControl() {
  const pathname = usePathname();
  const { user } = useAuth();
  const titleId = useId();
  const ready = useHydrated();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(true);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [lastGithubIssueUrl, setLastGithubIssueUrl] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [honeypot, setHoneypot] = useState("");

  useEffect(() => {
    if (open) {
      textareaRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (status !== "sent" || open) {
      return;
    }
    const id = window.setTimeout(() => {
      setStatus("idle");
    }, BUG_REPORT_ACK_MS);
    return () => window.clearTimeout(id);
  }, [status, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-bug-report]")) {
        return;
      }
      setOpen(false);
    }
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  async function handleSend() {
    const text = description.trim();
    if (!text) {
      setError("Describe what's going on.");
      return;
    }
    if (text.length < 8) {
      setError("Add a bit more detail (at least 8 characters).");
      return;
    }

    setSending(true);
    setError(null);
    flushSync(() => {
      setOpen(false);
      setVisible(false);
    });

    await waitTwoAnimationFrames();

    let screenshotJpegBase64: string | undefined;
    try {
      screenshotJpegBase64 = await capturePageJpegBase64();
    } catch {
      screenshotJpegBase64 = undefined;
    }

    setVisible(true);

    try {
      const submitted = await submitBugReport({
        description: text,
        screenshotJpegBase64,
        logText: buildClientLogText({
          path: pathname || "/",
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          userEmail: user?.email,
          userRole: user?.role,
        }),
        path: pathname || "/",
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        userEmail: user?.email,
        userRole: user?.role,
        website: honeypot,
      });
      setDescription("");
      setLastGithubIssueUrl(submitted.githubIssueUrl);
      setStatus("sent");
    } catch (cause) {
      setStatus("error");
      setError(errorMessage(cause, "Could not send the report."));
    } finally {
      setSending(false);
    }
  }

  if (!visible) {
    return null;
  }

  if (!user) {
    return null;
  }

  return (
    <div data-bug-report="" className="relative">
      <button
        type="button"
        aria-label="Report bug"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        onClick={() => {
          setOpen((current) => !current);
          setError(null);
          if (status !== "idle") {
            setStatus("idle");
          }
        }}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-current transition-opacity duration-200 hover:opacity-70"
      >
        <ReportIcon />
      </button>

      {status === "sent" && !open && ready
        ? createPortal(
            <p
              className="btn-primary pointer-events-none fixed z-[80] rounded-full px-3 py-1.5 text-xs font-medium shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
              style={{
                top: "calc(var(--spares-header) + 0.5rem)",
                right: "max(0.75rem, env(safe-area-inset-right))",
              }}
              role="status"
            >
              {lastGithubIssueUrl ? "Sent. Thank you." : "Saved for staff review."}
            </p>,
            document.body,
          )
        : null}
      {status === "error" && error && !open && ready
        ? createPortal(
            <p
              className="spares-alert pointer-events-none fixed z-[80] max-w-[14rem] rounded-2xl px-3 py-2 text-right text-xs shadow-[0_8px_24px_rgba(0,0,0,0.32)]"
              style={{
                top: "calc(var(--spares-header) + 0.5rem)",
                right: "max(0.75rem, env(safe-area-inset-right))",
              }}
              role="alert"
            >
              {error}
            </p>,
            document.body,
          )
        : null}

      {open && ready
        ? createPortal(
            <div
              data-bug-report=""
              role="dialog"
              aria-labelledby={titleId}
              className="bug-report-sheet spares-surface fixed z-[70] w-[min(22rem,calc(100vw-1.5rem))] rounded-[24px] border border-white/8 p-4 shadow-[0_16px_40px_rgba(0,0,0,0.42)]"
              style={{
                top: "max(4.75rem, calc(env(safe-area-inset-top) + 4rem))",
                right: "max(0.75rem, env(safe-area-inset-right))",
              }}
            >
              <p id={titleId} className="text-sm font-medium">
                Report bug
              </p>
              <p className="spares-muted mt-1 text-xs leading-snug">
                Send includes a screenshot of this page and recent app logs. Describe
                what you expected instead.
              </p>
              <label htmlFor="bug-report-description" className="sr-only">
                What is going on?
              </label>
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(event) => setHoneypot(event.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="pointer-events-none absolute h-0 w-0 opacity-0"
              />
              <textarea
                ref={textareaRef}
                id="bug-report-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What's going on?"
                rows={4}
                className="spares-field mt-2 w-full resize-none rounded-xl border-0 px-2.5 py-2 text-sm outline-none ring-1 ring-white/8"
              />
              {error && status !== "error" ? (
                <p className="mt-1.5 text-xs text-[#f0c4c0]" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                  className="spares-muted inline-flex h-11 items-center rounded-full px-3 text-sm font-medium hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sending || !description.trim()}
                  onClick={() => {
                    void handleSend();
                  }}
                  className="btn-primary inline-flex h-11 items-center rounded-full px-3 text-sm font-medium disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
