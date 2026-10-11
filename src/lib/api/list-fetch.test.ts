import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import {
  apiFetchList,
  clearListFetchStateForTests,
  seedListSlotForTests,
} from "./list-fetch.ts";
import { invalidateWarmRead } from "./warm-read.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearListFetchStateForTests();
  invalidateWarmRead("quotes:list");
});

describe("apiFetchList ETag / 304", () => {
  it("does not send If-None-Match until a body is cached", async () => {
    const seen: string[] = [];
    globalThis.fetch = mock.fn(async (_url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(headers.get("If-None-Match") ?? "");
      return new Response(JSON.stringify({ quotes: [{ id: "q1" }], unreadCount: 0 }), {
        status: 200,
        headers: { "content-type": "application/json", etag: 'W/"a"' },
      });
    }) as typeof fetch;

    await apiFetchList<{ quotes: unknown[] }>("/api/quotes", "quotes:list");
    invalidateWarmRead("quotes:list");
    await apiFetchList<{ quotes: unknown[] }>("/api/quotes", "quotes:list");

    assert.deepEqual(seen, ["", 'W/"a"']);
  });

  it("resolves 304 from the in-memory body without deadlocking readIfWarm", async () => {
    let calls = 0;
    globalThis.fetch = mock.fn(async (_url: string, init?: RequestInit) => {
      calls += 1;
      const inm = new Headers(init?.headers).get("If-None-Match");
      if (!inm) {
        return new Response(JSON.stringify({ quotes: [{ id: "q1" }], unreadCount: 0 }), {
          status: 200,
          headers: { "content-type": "application/json", etag: 'W/"b"' },
        });
      }
      return new Response(null, { status: 304, headers: { etag: 'W/"b"' } });
    }) as typeof fetch;

    await apiFetchList<{ quotes: Array<{ id: string }> }>("/api/quotes", "quotes:list");
    invalidateWarmRead("quotes:list");

    const second = await apiFetchList<{ quotes: Array<{ id: string }> }>(
      "/api/quotes",
      "quotes:list",
    );
    assert.equal(second.quotes[0]?.id, "q1");
    assert.equal(calls, 2);
  });

  it("ignores orphan etag when no body is held (no If-None-Match)", async () => {
    const seen: string[] = [];
    globalThis.fetch = mock.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get("If-None-Match") ?? "");
      return new Response(JSON.stringify({ quotes: [], unreadCount: 0 }), {
        status: 200,
        headers: { "content-type": "application/json", etag: 'W/"orphan"' },
      });
    }) as typeof fetch;

    seedListSlotForTests("quotes:list", "/api/quotes", 'W/"orphan"');

    await apiFetchList<{ quotes: unknown[] }>("/api/quotes", "quotes:list");
    assert.deepEqual(seen, [""]);
  });
});
