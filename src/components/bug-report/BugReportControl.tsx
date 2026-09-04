"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { submitBugReport } from "@/lib/api/bugs";
import { errorMessage } from "@/lib/api/errors";
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
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) {
      textareaRef.current?.focus();
    }
  }, [open]);

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
      await submitBugReport({
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
      });
      setDescription("");
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
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#0b0d10] transition-colors duration-200 hover:bg-neutral-200/80"
      >
        <ReportIcon />
      </button>

      {status === "sent" && !open && ready
        ? createPortal(
            <p
              className="pointer-events-none fixed z-[80] rounded-full bg-[#0b0d10] px-3 py-1.5 text-xs font-medium text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)]"
              style={{
                top: "calc(var(--spares-header) + 0.5rem)",
                right: "max(0.75rem, env(safe-area-inset-right))",
              }}
              role="status"
            >
              Sent. Thank you.
            </p>,
            document.body,
          )
        : null}
      {status === "error" && error && !open && ready
        ? createPortal(
            <p
              className="pointer-events-none fixed z-[80] max-w-[14rem] rounded-2xl bg-white px-3 py-2 text-right text-xs text-red-800 shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
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
              className="bug-report-sheet fixed z-[70] w-[min(22rem,calc(100vw-1.5rem))] rounded-[24px] border border-black/8 bg-white p-4 shadow-[0_16px_40px_rgba(15,18,22,0.16)]"
              style={{
                top: "max(4.75rem, calc(env(safe-area-inset-top) + 4rem))",
                right: "max(0.75rem, env(safe-area-inset-right))",
              }}
            >
              <p id={titleId} className="text-sm font-medium text-[#0b0d10]">
                Report bug
              </p>
              <label htmlFor="bug-report-description" className="sr-only">
                What is going on?
              </label>
              <textarea
                ref={textareaRef}
                id="bug-report-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What's going on?"
                rows={4}
                className="mt-2 w-full resize-none rounded-xl border-0 bg-[#f4f5f7] px-2.5 py-2 text-sm text-[#0b0d10] outline-none ring-1 ring-black/8"
              />
              {error && status !== "error" ? (
                <p className="mt-1.5 text-xs text-red-800" role="alert">
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
                  className="inline-flex h-11 items-center rounded-full px-3 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sending}
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
