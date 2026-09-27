import { getPersistence } from "./persistence.ts";

export const CHAT_WATCH_HOLD_MS = 25_000;
export const CHAT_WATCH_PEEK_MS = 1_000;
export const CHAT_WATCH_PERSIST_ATTEMPTS = 3;

export type ChatWatchKind = "ticket" | "quote";
export type ChatWatchChannel = `${ChatWatchKind}:${string}`;

const memory = new Map<string, number>();
const waiters = new Map<string, Set<(rev: number) => void>>();

export function chatWatchChannel(kind: ChatWatchKind, id: string): ChatWatchChannel {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error("Chat watch id is required");
  }
  return `${kind}:${trimmed}`;
}

export function chatWatchFileName(channel: ChatWatchChannel) {
  const match = /^(ticket|quote):([A-Za-z0-9._-]+)$/.exec(channel);
  if (!match) {
    throw new Error("Invalid chat watch channel");
  }
  return `chat-watch-${match[1]}-${match[2]}.json`;
}

export function resetChatWatchForTests() {
  memory.clear();
  waiters.clear();
}

export function chatWatchWaiterCountForTests(channel?: ChatWatchChannel) {
  if (channel) {
    return waiters.get(channel)?.size ?? 0;
  }
  let count = 0;
  for (const listeners of waiters.values()) {
    count += listeners.size;
  }
  return count;
}

function notify(channel: string, rev: number) {
  const listeners = waiters.get(channel);
  if (!listeners?.size) {
    return;
  }
  waiters.delete(channel);
  for (const listener of listeners) {
    listener(rev);
  }
}

function addWaiter(channel: ChatWatchChannel, listener: (rev: number) => void) {
  let listeners = waiters.get(channel);
  if (!listeners) {
    listeners = new Set();
    waiters.set(channel, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      waiters.delete(channel);
    }
  };
}

function parseRev(raw: string | null) {
  if (!raw?.trim()) {
    return 0;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
    if (parsed && typeof parsed === "object" && "rev" in parsed) {
      const rev = Number((parsed as { rev: unknown }).rev);
      return Number.isFinite(rev) && rev > 0 ? rev : 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

async function readPersistedRev(channel: ChatWatchChannel) {
  const bytes = await getPersistence().readFileBytes(chatWatchFileName(channel));
  return parseRev(bytes?.toString("utf8") ?? null);
}

async function persistChannel(channel: ChatWatchChannel, rev: number) {
  const bytes = Buffer.from(JSON.stringify({ rev }));
  const name = chatWatchFileName(channel);
  let lastError: unknown;
  for (let attempt = 1; attempt <= CHAT_WATCH_PERSIST_ATTEMPTS; attempt++) {
    try {
      await getPersistence().writeFileBytes(name, bytes);
      return;
    } catch (cause) {
      lastError = cause;
      if (attempt < CHAT_WATCH_PERSIST_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 50 * attempt));
      }
    }
  }
  console.warn("chat watch persist failed", lastError);
}

export async function readChatWatch(channel: ChatWatchChannel) {
  const local = memory.get(channel) ?? 0;
  try {
    const persisted = await readPersistedRev(channel);
    const rev = Math.max(local, persisted);
    if (rev > local) {
      memory.set(channel, rev);
    }
    return rev;
  } catch {
    return local;
  }
}

export async function bumpChatWatch(channel: ChatWatchChannel) {
  const rev = Date.now();
  const previous = memory.get(channel) ?? 0;
  const next = rev <= previous ? previous + 1 : rev;
  memory.set(channel, next);
  notify(channel, next);
  await persistChannel(channel, next);
  return next;
}

export async function waitForChatWatch(
  channel: ChatWatchChannel,
  since: number,
  options?: { maxMs?: number; signal?: AbortSignal },
) {
  const maxMs = options?.maxMs ?? CHAT_WATCH_HOLD_MS;
  const signal = options?.signal;
  const first = await readChatWatch(channel);
  if (first > since || signal?.aborted) {
    return first;
  }

  return new Promise<number>((resolve) => {
    let settled = false;
    let peekTimer: ReturnType<typeof setTimeout> | undefined;
    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let removeWaiter = () => {};

    const finish = (rev: number) => {
      if (settled) {
        return;
      }
      settled = true;
      removeWaiter();
      if (peekTimer) {
        clearTimeout(peekTimer);
      }
      if (deadlineTimer) {
        clearTimeout(deadlineTimer);
      }
      signal?.removeEventListener("abort", onAbort);
      resolve(rev);
    };

    const onAbort = () => {
      void readChatWatch(channel).then(finish, () => finish(memory.get(channel) ?? 0));
    };

    const peek = async () => {
      if (settled) {
        return;
      }
      try {
        const rev = await readChatWatch(channel);
        if (rev > since) {
          finish(rev);
          return;
        }
      } catch {
        /* keep waiting; the next peek retries */
      }
      if (!settled) {
        peekTimer = setTimeout(() => {
          void peek();
        }, CHAT_WATCH_PEEK_MS);
      }
    };

    removeWaiter = addWaiter(channel, (rev) => {
      if (rev > since) {
        finish(rev);
      }
    });

    const raced = memory.get(channel) ?? 0;
    if (raced > since) {
      finish(raced);
      return;
    }

    deadlineTimer = setTimeout(() => {
      void readChatWatch(channel).then(finish, () => finish(memory.get(channel) ?? 0));
    }, maxMs);

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    void peek();
  });
}

export function conversationWatchChanged(
  before: { status: string; assistantPaused?: boolean; activities: { id: string }[] },
  after: { status: string; assistantPaused?: boolean; activities: { id: string }[] },
) {
  return (
    before.status !== after.status ||
    Boolean(before.assistantPaused) !== Boolean(after.assistantPaused) ||
    before.activities.length !== after.activities.length ||
    before.activities.at(-1)?.id !== after.activities.at(-1)?.id
  );
}

/** Ring the other party when a customer read watermark moves (staff read marks stay silent). */
export function customerReadWatchChanged(
  before: Record<string, string>,
  after: Record<string, string>,
  customerUserIds: readonly string[],
) {
  for (const userId of customerUserIds) {
    if (before[userId] !== after[userId]) {
      return true;
    }
  }
  return false;
}

export async function bumpConversationWatchForCustomerRead(
  kind: ChatWatchKind,
  id: string,
  before: Record<string, string>,
  after: Record<string, string>,
  customerUserIds: readonly string[],
) {
  if (!customerReadWatchChanged(before, after, customerUserIds)) {
    return;
  }
  await bumpChatWatch(chatWatchChannel(kind, id));
}
