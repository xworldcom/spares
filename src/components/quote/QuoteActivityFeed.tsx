"use client";

import { useState } from "react";
import { formatWhen } from "@/components/quote/quote-format";
import { initialsFromEmail, isHumanComment } from "@/lib/ui/initials";
import type { QuoteActivity, Role } from "@/types";

function actorLabel(
  activity: QuoteActivity,
  role: Role,
  selfEmail: string,
) {
  if (activity.actorEmail === selfEmail && activity.actorRole === role) {
    return "You";
  }
  if (role === "customer") {
    return "Spares";
  }
  return activity.actorEmail;
}

function InitialsAvatar({
  email,
  own,
}: {
  email: string;
  own: boolean;
}) {
  const initials = initialsFromEmail(email);
  return (
    <span
      aria-label={`${initials} avatar`}
      className={
        own
          ? "inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0a84ff] text-[12px] font-semibold tracking-wide text-white"
          : "btn-soft inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tracking-wide"
      }
    >
      {initials}
    </span>
  );
}

export function QuoteActivityFeed({
  activities,
  role,
  selfEmail,
  busy,
  onSend,
}: {
  activities: QuoteActivity[];
  role: Role;
  selfEmail: string;
  busy: boolean;
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");

  return (
    <section className="spares-surface rounded-[24px] p-5">
      <h2 className="text-[19px] font-semibold tracking-tight">Activity</h2>
      <ol className="mt-4 space-y-3">
        {activities.length === 0 ? (
          <li className="spares-muted text-sm">No activity yet.</li>
        ) : (
          activities.map((activity) => {
            const human = isHumanComment(activity);
            const own =
              activity.actorEmail === selfEmail && activity.actorRole === role;
            return (
              <li
                key={activity.id}
                className={
                  human
                    ? "spares-field flex gap-3 rounded-[18px] px-3 py-3"
                    : "rounded-[18px] px-1 py-2"
                }
              >
                {human ? <InitialsAvatar email={activity.actorEmail} own={own} /> : null}
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      human
                        ? "spares-muted text-xs font-medium"
                        : "spares-muted text-xs font-medium"
                    }
                  >
                    {actorLabel(activity, role, selfEmail)}
                    <span className="font-normal"> · {formatWhen(activity.at)}</span>
                  </p>
                  <p
                    className={
                      human
                        ? "mt-1 whitespace-pre-wrap text-[15px]"
                        : "spares-muted mt-0.5 whitespace-pre-wrap text-[14px]"
                    }
                  >
                    {activity.text}
                  </p>
                </div>
              </li>
            );
          })
        )}
      </ol>
      <form
        className="mt-4 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const next = text.trim();
          if (!next) {
            return;
          }
          void onSend(next).then(() => setText(""));
        }}
      >
        <label className="block text-sm font-medium">
          Message
          <textarea
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="spares-field mt-1.5 w-full resize-none rounded-2xl border-0 px-3 py-2.5 text-[16px] outline-none"
            placeholder="Write a note…"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="btn-primary inline-flex h-12 items-center rounded-full px-5 text-[15px] font-semibold disabled:opacity-30"
        >
          Send
        </button>
      </form>
    </section>
  );
}
