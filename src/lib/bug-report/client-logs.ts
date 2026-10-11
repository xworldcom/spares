import { stripSecrets } from "./format";

const MAX_CONSOLE = 50;
const MAX_FETCHES = 20;

type ConsoleEntry = {
  t: string;
  level: "error" | "warn";
  message: string;
};

type FailedFetch = {
  t: string;
  url: string;
  status: number;
};

const consoleEntries: ConsoleEntry[] = [];
const failedFetches: FailedFetch[] = [];

function pushLimited<T>(list: T[], item: T, max: number) {
  list.push(item);
  if (list.length > max) {
    list.splice(0, list.length - max);
  }
}

function formatArg(value: unknown): string {
  if (typeof value === "string") {
    return stripSecrets(value);
  }
  if (value instanceof Error) {
    return stripSecrets(`${value.name}: ${value.message}`);
  }
  try {
    return stripSecrets(JSON.stringify(value));
  } catch {
    return stripSecrets(String(value));
  }
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  return input.url;
}

export function installClientLogCapture() {
  if (typeof window === "undefined") {
    return;
  }
  const marker = window as Window & { __sparesBugLogs?: boolean };
  if (marker.__sparesBugLogs) {
    return;
  }
  marker.__sparesBugLogs = true;

  const originalError = console.error.bind(console);
  const originalWarn = console.warn.bind(console);

  console.error = (...args: unknown[]) => {
    pushLimited(
      consoleEntries,
      {
        t: new Date().toISOString(),
        level: "error",
        message: args.map(formatArg).join(" "),
      },
      MAX_CONSOLE,
    );
    originalError(...args);
  };
  console.warn = (...args: unknown[]) => {
    pushLimited(
      consoleEntries,
      {
        t: new Date().toISOString(),
        level: "warn",
        message: args.map(formatArg).join(" "),
      },
      MAX_CONSOLE,
    );
    originalWarn(...args);
  };

  window.addEventListener("error", (event) => {
    pushLimited(
      consoleEntries,
      {
        t: new Date().toISOString(),
        level: "error",
        message: stripSecrets(event.message || String(event.error ?? "error")),
      },
      MAX_CONSOLE,
    );
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = formatArg(reason);
    const transientReachability =
      message.includes("Could not reach OEE360") ||
      (reason instanceof Error &&
        reason.name === "AbortError" &&
        message.includes("aborted"));
    if (transientReachability) {
      event.preventDefault();
      pushLimited(
        consoleEntries,
        {
          t: new Date().toISOString(),
          level: "warn",
          message: `transient fetch ${message}`,
        },
        MAX_CONSOLE,
      );
      return;
    }
    pushLimited(
      consoleEntries,
      {
        t: new Date().toISOString(),
        level: "error",
        message: `unhandledrejection ${message}`,
      },
      MAX_CONSOLE,
    );
  });

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = stripSecrets(requestUrl(input));
    try {
      const response = await originalFetch(input, init);
      if (!response.ok) {
        pushLimited(
          failedFetches,
          { t: new Date().toISOString(), url, status: response.status },
          MAX_FETCHES,
        );
      }
      return response;
    } catch (cause) {
      const aborted =
        init?.signal?.aborted ||
        (cause instanceof DOMException && cause.name === "AbortError") ||
        (cause instanceof Error && cause.name === "AbortError");
      if (!aborted) {
        pushLimited(
          failedFetches,
          { t: new Date().toISOString(), url, status: 0 },
          MAX_FETCHES,
        );
      }
      throw cause;
    }
  };
}

export function buildClientLogText(meta: {
  path: string;
  userAgent: string;
  userEmail?: string | null;
  userRole?: string | null;
}) {
  const user = meta.userEmail
    ? `${meta.userEmail}${meta.userRole ? ` (${meta.userRole})` : ""}`
    : "signed out";
  const consoleLines = consoleEntries.length
    ? consoleEntries.map((entry) => `${entry.t} [${entry.level}] ${entry.message}`)
    : ["  (none)"];
  const fetchLines = failedFetches.length
    ? failedFetches.map((entry) => `${entry.t} ${entry.status} ${entry.url}`)
    : ["  (none)"];

  return [
    `path: ${meta.path}`,
    `userAgent: ${stripSecrets(meta.userAgent)}`,
    `user: ${user}`,
    "",
    "console (errors/warns):",
    ...consoleLines,
    "",
    "failed fetches:",
    ...fetchLines,
  ].join("\n");
}
