import { getPersistence } from "./persistence.ts";

export const CHAT_WATCH_HOLD_MS = 25_000;
export const CHAT_WATCH_PEEK_MS = 1_000;
export const CHAT_WATCH_FILE = "chat-watch.json";

export type ChatWatchKind = "ticket" | "quote";
export type ChatWatchChannel = `${ChatWatchKind}:${string}`;

const memory = new Map<string, number>();
const waiters = new Map<string, Set<(rev: number) => void>>();
let persistQueue: Promise<void> = Promise.resolve();

export function chatWatchChannel(kind: ChatWatchKind, id: string): ChatWatchChannel {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error("Chat watch id is required");
  }
  return `${kind}:${trimmed}`;
}

export function resetChatWatchForTests() {
  memory.clear();
  waiters.clear();
  persistQueue = Promise.resolve();
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

function parseWatchMap(raw: string | null): Record<string, number> {
  if (!raw?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const rev = typeof value === "number" ? value : Number(value);
      if (key && Number.isFinite(rev) && rev > 0) {
        next[key] = rev;
      }
    }
    return next;
  } catch {
    return {};
  }
}

async function readPersistedMap() {
  const bytes = await getPersistence().readFileBytes(CHAT_WATCH_FILE);
  return parseWatchMap(bytes?.toString("utf8") ?? null);
}

async function persistChannel(channel: ChatWatchChannel, rev: number) {
  persistQueue = persistQueue.then(async () => {
    const current = await readPersistedMap();
    current[channel] = rev;
    await getPersistence().writeFileBytes(
      CHAT_WATCH_FILE,
      Buffer.from(JSON.stringify(current)),
    );
  });
  await persistQueue.catch((cause) => {
    console.warn("chat watch persist failed", cause);
  });
}

export async function readChatWatch(channel: ChatWatchChannel) {
  const local = memory.get(channel) ?? 0;
  try {
    const persisted = (await readPersistedMap())[channel] ?? 0;
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

function waitForLocalBump(channel: ChatWatchChannel, since: number) {
  return new Promise<number>((resolve) => {
    const current = memory.get(channel) ?? 0;
    if (current > since) {
      resolve(current);
      return;
    }
    let listeners = waiters.get(channel);
    if (!listeners) {
      listeners = new Set();
      waiters.set(channel, listeners);
    }
    listeners.add(resolve);
  });
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export async function waitForChatWatch(
  channel: ChatWatchChannel,
  since: number,
  options?: { maxMs?: number; signal?: AbortSignal },
) {
  const maxMs = options?.maxMs ?? CHAT_WATCH_HOLD_MS;
  const signal = options?.signal;
  const deadline = Date.now() + maxMs;

  const first = await readChatWatch(channel);
  if (since <= 0 || first > since) {
    return first;
  }

  while (!signal?.aborted && Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const local = waitForLocalBump(channel, since);
    let finished = false;
    local.then(() => {
      finished = true;
    }, () => {});
    await Promise.race([local, sleep(Math.min(CHAT_WATCH_PEEK_MS, remaining), signal)]);
    if (finished) {
      return memory.get(channel) ?? (await readChatWatch(channel));
    }
    const rev = await readChatWatch(channel);
    if (rev > since) {
      return rev;
    }
  }

  return readChatWatch(channel);
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
