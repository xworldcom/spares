"use client";

import { useState } from "react";
import { formatWhen } from "@/components/quote/quote-format";
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
    <section className="rounded-[24px] bg-white p-5">
      <h2 className="text-[19px] font-semibold tracking-tight">Activity</h2>
      <ol className="mt-4 space-y-3">
        {activities.length === 0 ? (
          <li className="spares-muted text-sm">No activity yet.</li>
        ) : (
          activities.map((activity) => (
            <li key={activity.id} className="rounded-[18px] bg-[#f4f5f7] px-3 py-3">
              <p className="text-xs font-medium text-neutral-500">
                {actorLabel(activity, role, selfEmail)}
                <span className="font-normal"> · {formatWhen(activity.at)}</span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[15px] text-neutral-950">
                {activity.text}
              </p>
            </li>
          ))
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
        <label className="block text-sm font-medium text-neutral-700">
          Message
          <textarea
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="mt-1.5 w-full resize-none rounded-2xl border-0 bg-[#f4f5f7] px-3 py-2.5 text-[15px] outline-none"
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
