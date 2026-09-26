"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useConversationSheetChrome } from "@/components/chat/ConversationSheetContext";
import { ChatAttachmentView } from "@/components/chat/ChatAttachmentView";
import { formatWhen } from "@/components/quote/quote-format";
import {
  formatChatBytes,
  type ChatThreadKind,
  uploadChatAttachment,
  validateChatFileClient,
} from "@/lib/api/chat-attachments";
import { errorMessage } from "@/lib/api/errors";
import { initialsFromEmail } from "@/lib/ui/initials";
import { activityLane, sameMessageAuthor } from "@/lib/ui/activity-lane";
import { assistantActorLabel, isAssistantActivity } from "@/lib/assistant/actor";
import { displayNameFromEmail } from "@/lib/ui/display-name";
import { firstUnreadActivityIndex } from "@/lib/ui/conversation-unread";
import type { ChatAttachment, QuoteActivity, Role, TicketCustomerReadReceipt } from "@/types";

export type ActivitySendInput = {
  text: string;
  attachments?: ChatAttachment[];
};

function actorLabel(activity: QuoteActivity, role: Role, selfEmail: string) {
  if (isAssistantActivity(activity)) {
    return assistantActorLabel();
  }
  if (activity.actorEmail === selfEmail && activity.actorRole === role) {
    return "You";
  }
  if (role === "customer") {
    return "Spares";
  }
  return displayNameFromEmail(activity.actorEmail);
}

function OtherAvatar({ email, assistant }: { email: string; assistant?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={assistant ? "imsg-avatar imsg-avatar-assistant" : "imsg-avatar"}
    >
      {assistant ? "AI" : initialsFromEmail(email)}
    </span>
  );
}

function CustomerReadReceipts({
  receipts,
}: {
  receipts: TicketCustomerReadReceipt[];
}) {
  if (receipts.length === 0) {
    return null;
  }
  return (
    <li className="imsg-read-receipts" aria-label="Read by customers">
      {receipts.map((row) => (
        <span key={row.userId} className="imsg-read-receipt" title={row.email}>
          <span className="imsg-avatar">{initialsFromEmail(row.email)}</span>
          <span className="imsg-read-receipt-name">
            {row.name?.trim() || displayNameFromEmail(row.email)}
          </span>
        </span>
      ))}
    </li>
  );
}

export function QuoteActivityFeed({
  activities,
  role,
  selfEmail,
  busy,
  onSend,
  threadKind,
  threadId,
  title = "Conversation",
  subtitle,
  layout = "card",
  customerReadReceipts,
  assistantAvailable,
  assistantPaused,
  onAssistantPausedChange,
  viewerReadAt,
}: {
  activities: QuoteActivity[];
  role: Role;
  selfEmail: string;
  busy: boolean;
  onSend: (input: ActivitySendInput) => Promise<void>;
  threadKind: ChatThreadKind;
  threadId: string;
  title?: string;
  subtitle?: string;
  /** `sheet` fills the conversation sheet body; `card` keeps the legacy capped thread. */
  layout?: "card" | "sheet";
  /** Staff-only Care ticket read receipts (customers on thread). */
  customerReadReceipts?: TicketCustomerReadReceipt[];
  assistantAvailable?: boolean;
  assistantPaused?: boolean;
  onAssistantPausedChange?: (paused: boolean) => Promise<void>;
  /** Current viewer read watermark — used to jump to the first unread message. */
  viewerReadAt?: string;
}) {
  const sheetChrome = useConversationSheetChrome();
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(
    null,
  );
  const [composerError, setComposerError] = useState<string | null>(null);
  const [toggleBusy, setToggleBusy] = useState(false);
  const scrollerRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const seenIdsRef = useRef(new Set<string>());
  const bootstrappedRef = useRef(false);
  const unreadJumpedRef = useRef(false);
  const [enteringIds, setEnteringIds] = useState<Set<string>>(() => new Set());
  const self = { email: selfEmail, role };
  const firstUnreadIndex = firstUnreadActivityIndex(activities, self, viewerReadAt);
  const lastOwnIndex = activities.reduce(
    (found, activity, index) =>
      activityLane(activity, self) === "own" ? index : found,
    -1,
  );

  useEffect(() => {
    if (!bootstrappedRef.current) {
      for (const activity of activities) {
        seenIdsRef.current.add(activity.id);
      }
      if (activities.length > 0) {
        bootstrappedRef.current = true;
      }
      return;
    }
    const fresh: string[] = [];
    for (const activity of activities) {
      if (!seenIdsRef.current.has(activity.id)) {
        fresh.push(activity.id);
        seenIdsRef.current.add(activity.id);
      }
    }
    if (fresh.length > 0) {
      setEnteringIds(new Set(fresh));
    }
  }, [activities]);

  useEffect(() => {
    unreadJumpedRef.current = false;
  }, [threadId]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) {
      return;
    }
    const sheetSnap = sheetChrome?.snap;
    const shouldJumpUnread =
      layout === "sheet" &&
      firstUnreadIndex !== null &&
      !unreadJumpedRef.current &&
      sheetSnap &&
      sheetSnap !== "peek" &&
      sheetSnap !== "out";

    if (shouldJumpUnread) {
      const jump = () => {
        const marker = root.querySelector<HTMLElement>(`[data-unread-anchor="true"]`);
        if (!marker) {
          return;
        }
        marker.scrollIntoView({ block: "start" });
        unreadJumpedRef.current = true;
      };
      const id = window.setTimeout(jump, 460);
      return () => {
        window.clearTimeout(id);
      };
    }

    const nearBottom = root.scrollHeight - root.scrollTop - root.clientHeight < 96;
    // Sheet layout docks to latest unless we are browsing unread history at full.
    if (layout === "sheet") {
      if (sheetSnap === "full" && unreadJumpedRef.current) {
        return;
      }
      root.scrollTop = root.scrollHeight;
      return;
    }
    if (nearBottom) {
      root.scrollTop = root.scrollHeight;
    }
  }, [activities, layout, firstUnreadIndex, sheetChrome?.snap, threadId]);

  useEffect(() => {
    const node = inputRef.current;
    if (!node) {
      return;
    }
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 112)}px`;
  }, [text]);

  function addFiles(files: FileList | File[]) {
    setComposerError(null);
    const next: File[] = [];
    for (const file of files) {
      try {
        validateChatFileClient(file);
        next.push(file);
      } catch (cause) {
        setComposerError(errorMessage(cause, "Could not attach that file."));
        return;
      }
    }
    if (next.length) {
      setPendingFiles((current) => [...current, ...next]);
    }
  }

  async function submit() {
    const next = text.trim();
    if ((!next && pendingFiles.length === 0) || busy || uploading) {
      return;
    }
    setComposerError(null);
    setUploading(true);
    try {
      const attachments: ChatAttachment[] = [];
      for (const file of pendingFiles) {
        const uploaded = await uploadChatAttachment(threadKind, threadId, file, (progress) => {
          setUploadProgress(progress);
        });
        attachments.push(uploaded);
      }
      await onSend({
        text: next,
        ...(attachments.length ? { attachments } : {}),
      });
      setText("");
      setPendingFiles([]);
      setUploadProgress(null);
    } catch (cause) {
      setComposerError(errorMessage(cause, "Could not send that message."));
      throw cause;
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  const sendDisabled =
    busy || uploading || (!text.trim() && pendingFiles.length === 0);
  const showAssistantToggle =
    role === "staff" && Boolean(assistantAvailable && onAssistantPausedChange);

  async function onToggleAssistant(nextPaused: boolean) {
    if (!onAssistantPausedChange || toggleBusy) {
      return;
    }
    setToggleBusy(true);
    setComposerError(null);
    try {
      await onAssistantPausedChange(nextPaused);
    } catch (cause) {
      setComposerError(errorMessage(cause, "Could not update AI for this chat."));
    } finally {
      setToggleBusy(false);
    }
  }

  const cardClass =
    layout === "sheet" ? "imsg-card imsg-card--sheet" : "imsg-card";
  const threadClass =
    layout === "sheet" ? "imsg-thread imsg-thread--fill" : "imsg-thread";

  return (
    <section className={cardClass}>
      {layout === "sheet" ? null : (
        <header className="imsg-header">
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </header>
      )}
      <ol ref={scrollerRef} className={threadClass}>
        {activities.length === 0 ? (
          <li className="imsg-empty">No messages yet.</li>
        ) : (
          activities.map((activity, index) => {
            const lane = activityLane(activity, self);
            if (lane === "system") {
              return (
                <li
                  key={activity.id}
                  className={enteringIds.has(activity.id) ? "imsg-system imsg-enter" : "imsg-system"}
                >
                  <span className="imsg-chip">
                    {activity.text}
                    <span className="imsg-chip-when">{formatWhen(activity.at)}</span>
                  </span>
                </li>
              );
            }

            const prev = activities[index - 1];
            const nextActivity = activities[index + 1];
            const stacked = sameMessageAuthor(activity, prev);
            const lastInStack = !sameMessageAuthor(activity, nextActivity);
            const own = lane === "own";
            const assistant = isAssistantActivity(activity);
            const label = actorLabel(activity, role, selfEmail);
            const attachments = activity.attachments ?? [];

            const rowClass = [
              own ? "imsg-row imsg-own" : "imsg-row imsg-other",
              assistant ? "imsg-assistant" : "",
              enteringIds.has(activity.id) ? "imsg-enter" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <li
                key={activity.id}
                className={rowClass}
                data-unread-anchor={index === firstUnreadIndex ? "true" : undefined}
                data-has-unread-divider={index === firstUnreadIndex ? "true" : undefined}
                data-stacked={stacked ? "true" : "false"}
                data-end={lastInStack ? "true" : "false"}
                onAnimationEnd={() => {
                  if (!enteringIds.has(activity.id)) {
                    return;
                  }
                  setEnteringIds((current) => {
                    if (!current.has(activity.id)) {
                      return current;
                    }
                    const nextSet = new Set(current);
                    nextSet.delete(activity.id);
                    return nextSet;
                  });
                }}
                style={
                  enteringIds.has(activity.id)
                    ? ({ animationFillMode: "backwards" } as CSSProperties)
                    : undefined
                }
              >
                {index === firstUnreadIndex ? (
                  <div className="imsg-unread-divider" role="status" aria-label="New messages">
                    <span className="imsg-unread-divider-chev" aria-hidden="true">↓</span>
                    <span className="imsg-unread-divider-line" aria-hidden="true" />
                    <span className="imsg-unread-divider-label">New</span>
                    <span className="imsg-unread-divider-line" aria-hidden="true" />
                    <span className="imsg-unread-divider-chev" aria-hidden="true">↓</span>
                  </div>
                ) : null}
                {!own ? (
                  lastInStack ? (
                    <OtherAvatar email={activity.actorEmail} assistant={assistant} />
                  ) : (
                    <span className="imsg-avatar-spacer" aria-hidden="true" />
                  )
                ) : null}
                <div className="imsg-stack">
                  {!own && !stacked ? (
                    <p className="imsg-meta">{label}</p>
                  ) : null}
                  <div className="imsg-bubble">
                    {activity.text ? <p className="imsg-text">{activity.text}</p> : null}
                    {attachments.length > 0 ? (
                      <div className="imsg-attachments">
                        {attachments.map((attachment) => (
                          <ChatAttachmentView
                            key={attachment.id}
                            attachment={attachment}
                            threadKind={threadKind}
                            threadId={threadId}
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {lastInStack ? (
                    <p className="imsg-when">
                      {formatWhen(activity.at)}
                      {customerReadReceipts?.length && index === lastOwnIndex
                        ? (
                            <span className="imsg-when-read">
                              {" · "}
                              Read by{" "}
                              {customerReadReceipts
                                .map((row) => row.name?.trim() || displayNameFromEmail(row.email))
                                .join(", ")}
                            </span>
                          )
                        : null}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
        {customerReadReceipts?.length && layout !== "sheet" ? (
          <CustomerReadReceipts receipts={customerReadReceipts} />
        ) : null}
      </ol>
      <form
        className="imsg-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {pendingFiles.length > 0 ? (
          <ul className="imsg-pending-files">
            {pendingFiles.map((file, index) => (
              <li key={`${file.name}-${index}`}>
                <span>{file.name}</span>
                <span className="imsg-pending-size">{formatChatBytes(file.size)}</span>
                <button
                  type="button"
                  className="imsg-pending-remove"
                  onClick={() => {
                    setPendingFiles((current) => current.filter((_, i) => i !== index));
                  }}
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {uploadProgress ? (
          <p className="imsg-upload-progress" aria-live="polite">
            Uploading… {Math.round((uploadProgress.loaded / uploadProgress.total) * 100)}%
          </p>
        ) : null}
        {composerError ? (
          <p className="imsg-composer-error" role="alert">{composerError}</p>
        ) : null}
        {showAssistantToggle ? (
          <label className="imsg-ai-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={!assistantPaused}
              disabled={busy || toggleBusy}
              onChange={(event) => {
                void onToggleAssistant(!event.target.checked);
              }}
            />
            <span>{assistantPaused ? "AI off for this chat" : "AI on this chat"}</span>
          </label>
        ) : null}
        <div className="imsg-composer-row">
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            multiple
            onChange={(event) => {
              if (event.target.files?.length) {
                addFiles(event.target.files);
              }
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="imsg-attach"
            disabled={busy || uploading}
            aria-label="Attach file"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M8.5 14.5 15 8a3.5 3.5 0 1 1 5 5l-7.5 7.5a5 5 0 1 1-7-7l8-8" />
            </svg>
          </button>
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
              disabled={uploading}
            />
          </label>
          <button
            type="submit"
            disabled={sendDisabled}
            className="imsg-send"
          >
            {uploading ? "…" : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
