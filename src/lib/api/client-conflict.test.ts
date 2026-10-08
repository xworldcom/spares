import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { apiFetch } from "./client.ts";
import { isApiError } from "./errors.ts";

const realFetch = globalThis.fetch;

function conflict() {
  return Response.json(
    { error: "Someone saved at the same moment, so nothing was changed. Please try again.", code: "catalog-conflict" },
    { status: 409 },
  );
}

describe("apiFetch on a catalog conflict", () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("retries a mutation once and returns the second answer", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls === 1 ? conflict() : Response.json({ ok: true });
    }) as typeof fetch;
    const result = await apiFetch<{ ok: boolean }>("/api/quotes", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
    });
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);
  });

  it("surfaces the friendly message when the retry conflicts too", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return conflict();
    }) as typeof fetch;
    await assert.rejects(
      () => apiFetch("/api/quotes", { method: "POST", body: "{}" }),
      (cause: unknown) =>
        isApiError(cause) && cause.status === 409 && /try again/i.test(cause.message),
    );
    assert.equal(calls, 2);
  });

  it("does not retry reads or unrelated 409s", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return conflict();
    }) as typeof fetch;
    await assert.rejects(() => apiFetch("/api/quotes"));
    assert.equal(calls, 1);

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return Response.json({ error: "Email taken" }, { status: 409 });
    }) as typeof fetch;
    await assert.rejects(() => apiFetch("/api/users", { method: "POST", body: "{}" }));
    assert.equal(calls, 1);
  });
});
