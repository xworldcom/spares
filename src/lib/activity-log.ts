import { randomUUID } from "node:crypto";
import {
  ACTIVITY_ACTIONS,
  type ActivityAccount,
  type ActivityActor,
  type ActivityDetailValue,
  type ActivityEvent,
  type ActivityTarget,
  type RecordAccountActivityInput,
} from "./activity-log-types.ts";
import { isActivityLogEnabled } from "./activity-log-public.ts";
import { getPersistence, PersistenceReadError } from "./persistence.ts";

export const ACTIVITY_LOG_SCHEMA_VERSION = 1;
export const ACTIVITY_LOG_PAGE_SIZE = 200;
export const ACTIVITY_LOG_MAX_PAGE = 500;

export {
  ACTIVITY_ACTIONS,
  ACTIVITY_ACTION_LABELS,
  type ActivityAccount,
  type ActivityAction,
  type ActivityActor,
  type ActivityActorRole,
  type ActivityDetailValue,
  type ActivityEvent,
  type ActivityTarget,
  type RecordAccountActivityInput,
} from "./activity-log-types.ts";

type ActivityDocument = {
  schemaVersion: number;
  events: ActivityEvent[];
};

const ACTION_SET = new Set<string>(ACTIVITY_ACTIONS);

let queue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function actorFromUser(user: {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
}): ActivityActor {
  const role = user.role === "staff" || user.role === "customer" ? user.role : null;
  return {
    userId: user.id,
    email: user.email,
    name: user.name ?? null,
    role,
  };
}

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function sanitizeDetails(
  details?: Record<string, ActivityDetailValue>,
): Record<string, ActivityDetailValue> | undefined {
  if (!details) {
    return undefined;
  }
  const next: Record<string, ActivityDetailValue> = {};
  for (const [key, value] of Object.entries(details)) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      next[key] = typeof value === "string" ? value.slice(0, 400) : value;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeTarget(target?: ActivityTarget): ActivityTarget | undefined {
  if (!target || typeof target.type !== "string" || typeof target.id !== "string") {
    return undefined;
  }
  const type = target.type.trim().slice(0, 40);
  const id = target.id.trim().slice(0, 120);
  if (!type || !id) {
    return undefined;
  }
  const label = target.label?.trim().slice(0, 200);
  return label ? { type, id, label } : { type, id };
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!value || typeof value !== "object") {
    return false;
  }
  const row = value as ActivityEvent;
  return (
    typeof row.id === "string" &&
    typeof row.at === "string" &&
    typeof row.tenantId === "string" &&
    typeof row.summary === "string" &&
    ACTION_SET.has(row.action)
  );
}

export function parseActivityDocument(raw: string): ActivityDocument | null {
  try {
    const parsed = JSON.parse(raw) as ActivityDocument;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.events)) {
      return null;
    }
    return {
      schemaVersion: ACTIVITY_LOG_SCHEMA_VERSION,
      events: parsed.events.filter(isActivityEvent),
    };
  } catch {
    return null;
  }
}

function emptyDocument(): ActivityDocument {
  return { schemaVersion: ACTIVITY_LOG_SCHEMA_VERSION, events: [] };
}

async function readDocument(): Promise<ActivityDocument> {
  const raw = await getPersistence().readActivityJson();
  if (raw === null) {
    return emptyDocument();
  }
  const parsed = parseActivityDocument(raw);
  if (!parsed) {
    throw new PersistenceReadError("activity.json");
  }
  return parsed;
}

function eventMatchesAccount(event: ActivityEvent, account: string) {
  const needle = account.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  if (event.actorUserId === account.trim()) {
    return true;
  }
  if (normalizeEmail(event.actorEmail) === needle) {
    return true;
  }
  if (event.target?.id === account.trim()) {
    return true;
  }
  if (normalizeEmail(event.target?.label) === needle) {
    return true;
  }
  return false;
}

function collectAccounts(events: ActivityEvent[]): ActivityAccount[] {
  const seen = new Map<string, ActivityAccount>();
  for (const event of events) {
    const email = normalizeEmail(event.actorEmail);
    const key = event.actorUserId || email;
    if (!key) {
      continue;
    }
    if (!seen.has(key)) {
      seen.set(key, {
        userId: event.actorUserId,
        email: event.actorEmail,
        name: event.actorName,
      });
    }
  }
  return [...seen.values()].sort((a, b) =>
    (a.email ?? a.name ?? "").localeCompare(b.email ?? b.name ?? ""),
  );
}

export function filterActivityEvents(
  events: ActivityEvent[],
  options: {
    tenantId?: string;
    account?: string;
    since?: string;
    before?: string;
    limit?: number;
  },
) {
  const limit = Math.min(
    Math.max(options.limit ?? ACTIVITY_LOG_PAGE_SIZE, 1),
    ACTIVITY_LOG_MAX_PAGE,
  );
  const tenantId = options.tenantId?.trim();
  const account = options.account?.trim();
  const since = options.since?.trim();
  const before = options.before?.trim();

  const scoped = events.filter((event) => {
    if (tenantId && event.tenantId !== tenantId) {
      return false;
    }
    if (account && !eventMatchesAccount(event, account)) {
      return false;
    }
    if (since && event.at <= since) {
      return false;
    }
    if (before && event.at >= before) {
      return false;
    }
    return true;
  });

  scoped.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.id < b.id ? 1 : -1));
  return scoped.slice(0, limit);
}

export async function listAccountActivity(options: {
  tenantId?: string;
  account?: string;
  since?: string;
  before?: string;
  limit?: number;
}) {
  if (!isActivityLogEnabled()) {
    return { events: [], accounts: [], total: 0 };
  }
  const document = await readDocument();
  const tenantEvents = options.tenantId
    ? document.events.filter((event) => event.tenantId === options.tenantId)
    : document.events;
  return {
    events: filterActivityEvents(document.events, options),
    accounts: collectAccounts(tenantEvents),
    total: tenantEvents.length,
  };
}

export async function recordAccountActivity(
  input: RecordAccountActivityInput,
): Promise<ActivityEvent | null> {
  if (!isActivityLogEnabled()) {
    return null;
  }
  const tenantId = input.tenantId.trim();
  const summary = input.summary.trim().slice(0, 400);
  if (!tenantId || !summary) {
    return null;
  }

  const event: ActivityEvent = {
    id: randomUUID(),
    at: new Date().toISOString(),
    tenantId,
    actorUserId: input.actor.userId?.trim() || null,
    actorEmail: normalizeEmail(input.actor.email) || null,
    actorName: input.actor.name?.trim() || null,
    actorRole: input.actor.role ?? null,
    action: input.action,
    summary,
    target: sanitizeTarget(input.target),
    details: sanitizeDetails(input.details),
  };

  try {
    await withLock(async () => {
      const document = await readDocument();
      document.events.push(event);
      await getPersistence().writeActivityJson(JSON.stringify(document, null, 2));
    });
    return event;
  } catch (cause) {
    console.error("activity log write failed", cause);
    return null;
  }
}
