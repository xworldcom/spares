"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { submitBugReport } from "@/lib/api/bugs";
import { errorMessage } from "@/lib/api/errors";
import { buildClientLogText } from "@/lib/bug-report/client-logs";
import {
  capturePageJpegBase64,
  waitTwoAnimationFrames,
} from "@/lib/bug-report/screenshot";

type Status = "idle" | "sent" | "error";

export function BugReportControl() {
  const pathname = usePathname();
  const { user } = useAuth();
  const titleId = useId();
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
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function handleSend() {
    const text = description.trim();
    if (!text) {
      setError("Describe what's going on.");
      return;
    }

    setSending(true);
    setError(null);
    setOpen(false);
    setVisible(false);

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
    <div data-bug-report="" className="pointer-events-none">
      {open ? (
        <div
          role="dialog"
          aria-labelledby={titleId}
          className="pointer-events-auto fixed z-40 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-neutral-300 bg-white p-3 shadow-md"
          style={{
            left: "max(1rem, env(safe-area-inset-left))",
            bottom: "max(4.25rem, calc(env(safe-area-inset-bottom) + 3.5rem))",
          }}
        >
          <p id={titleId} className="text-sm font-medium text-neutral-800">
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
            className="mt-2 w-full resize-none rounded-md border border-neutral-300 bg-white px-2.5 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-700"
          />
          {error && status !== "error" ? (
            <p className="mt-1.5 text-xs text-red-700" role="alert">
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
              className="rounded-md px-2.5 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => {
                void handleSend();
              }}
              className="rounded-md bg-neutral-800 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 disabled:opacity-60"
            >
              Send
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="pointer-events-auto fixed z-40 flex items-end gap-2"
        style={{
          left: "max(1rem, env(safe-area-inset-left))",
          bottom: "max(1rem, env(safe-area-inset-bottom))",
        }}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? titleId : undefined}
          onClick={() => {
            setOpen((current) => !current);
            setError(null);
            if (status !== "idle") {
              setStatus("idle");
            }
          }}
          className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-neutral-300 bg-white/90 px-3 text-xs text-neutral-600 shadow-sm hover:bg-white hover:text-neutral-800"
        >
          Report bug
        </button>
        {status === "sent" ? (
          <p className="mb-2 max-w-[12rem] text-xs text-neutral-500">
            Sent. Thank you.
          </p>
        ) : null}
        {status === "error" && error ? (
          <p className="mb-2 max-w-[12rem] text-xs text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
