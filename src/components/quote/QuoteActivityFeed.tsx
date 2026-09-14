"use client";

import { useEffect, useRef, useState } from "react";
import { formatWhen } from "@/components/quote/quote-format";
import { initialsFromEmail } from "@/lib/ui/initials";
import { activityLane, sameMessageAuthor } from "@/lib/ui/activity-lane";
import { displayNameFromEmail } from "@/lib/ui/display-name";
import type { QuoteActivity, Role } from "@/types";

function actorLabel(activity: QuoteActivity, role: Role, selfEmail: string) {
  if (activity.actorEmail === selfEmail && activity.actorRole === role) {
    return "You";
  }
  if (role === "customer") {
    return "Spares";
  }
  return displayNameFromEmail(activity.actorEmail);
}

function OtherAvatar({ email }: { email: string }) {
  return (
    <span
      aria-hidden="true"
      className="imsg-avatar"
    >
      {initialsFromEmail(email)}
    </span>
  );
}

export function QuoteActivityFeed({
  activities,
  role,
  selfEmail,
  busy,
  onSend,
  title = "Conversation",
  subtitle = "Notes with the other party. Status stays on the timeline.",
}: {
  activities: QuoteActivity[];
  role: Role;
  selfEmail: string;
  busy: boolean;
  onSend: (text: string) => Promise<void>;
  title?: string;
  subtitle?: string;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const self = { email: selfEmail, role };

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) {
      return;
    }
    const nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 96;
    if (nearBottom) {
      root.scrollTop = root.scrollHeight;
    }
  }, [activities]);

  useEffect(() => {
    const node = inputRef.current;
    if (!node) {
      return;
    }
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 112)}px`;
  }, [text]);

  async function submit() {
    const next = text.trim();
    if (!next || busy || sending) {
      return;
    }
    setSendError(null);
    setSending(true);
    try {
      await onSend(next);
      setText("");
    } catch {
      setSendError("Could not send that message. Your text is still here — try again.");
    } finally {
      setSending(false);
    }
  }

  const composerBusy = busy || sending;

  return (
    <section className="imsg-card">
      <header className="imsg-header">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </header>
      <ol ref={scrollerRef} className="imsg-thread">
        {activities.length === 0 ? (
          <li className="imsg-empty">No messages yet. Status changes will land here as quiet chips.</li>
        ) : (
          activities.map((activity, index) => {
            const lane = activityLane(activity, self);
            if (lane === "system") {
              return (
                <li key={activity.id} className="imsg-system">
                  <span className="imsg-chip">
                    {activity.text}
                    <span className="imsg-chip-when">{formatWhen(activity.at)}</span>
                  </span>
                </li>
              );
            }

            const prev = activities[index - 1];
            const next = activities[index + 1];
            const stacked = sameMessageAuthor(activity, prev);
            const lastInStack = !sameMessageAuthor(activity, next);
            const own = lane === "own";
            const label = actorLabel(activity, role, selfEmail);

            return (
              <li
                key={activity.id}
                className={own ? "imsg-row imsg-own" : "imsg-row imsg-other"}
                data-stacked={stacked ? "true" : "false"}
                data-end={lastInStack ? "true" : "false"}
              >
                {!own ? (
                  lastInStack ? <OtherAvatar email={activity.actorEmail} /> : <span className="imsg-avatar-spacer" aria-hidden="true" />
                ) : null}
                <div className="imsg-stack">
                  {!own && !stacked ? (
                    <p className="imsg-meta">{label}</p>
                  ) : null}
                  <p className="imsg-bubble">{activity.text}</p>
                  {lastInStack ? (
                    <p className="imsg-when">{formatWhen(activity.at)}</p>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ol>
      <form
        className="imsg-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="imsg-composer-field">
          <span className="sr-only">Message</span>
          <textarea
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            className="imsg-input"
            placeholder="Message"
          />
        </label>
        <button
          type="submit"
          disabled={composerBusy || !text.trim()}
          className="imsg-send"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </form>
      {sendError ? (
        <p className="px-4 pb-3 text-sm text-[#f0c4c0]" role="alert">
          {sendError}
        </p>
      ) : null}
    </section>
  );
}
