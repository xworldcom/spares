"use client";

import { useEffect, useRef, useState } from "react";
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
import { displayNameFromEmail } from "@/lib/ui/display-name";
import type { ChatAttachment, QuoteActivity, Role } from "@/types";

export type ActivitySendInput = {
  text: string;
  attachments?: ChatAttachment[];
};

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
  threadKind,
  threadId,
  title = "Conversation",
  subtitle = "Notes with the other party. Status stays on the timeline.",
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
}) {
  const [text, setText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(
    null,
  );
  const [composerError, setComposerError] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const self = { email: selfEmail, role };

  useEffect(() => {
    const root = scrollerRef.current;
    if (root) {
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
            const attachments = activity.attachments ?? [];

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
