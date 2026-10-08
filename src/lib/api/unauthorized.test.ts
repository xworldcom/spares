import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { apiFetch } from "./client.ts";
import {
  isSessionProbePath,
  loginHrefForSignedOut,
  onUnauthorized,
  SIGNED_OUT_MESSAGE,
} from "./unauthorized.ts";

const realFetch = globalThis.fetch;

function stubFetch(status: number, body: unknown) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("apiFetch 401 handling", () => {
  it("notifies listeners and replaces the raw Unauthorized text", async () => {
    stubFetch(401, { error: "Unauthorized" });
    let notified = 0;
    const stop = onUnauthorized(() => {
      notified += 1;
    });
    await assert.rejects(
      () => apiFetch("/api/tickets/t1/activity", { method: "POST", body: "{}" }),
      (error: Error & { status?: number }) => {
        assert.equal(error.message, SIGNED_OUT_MESSAGE);
        assert.equal(error.status, 401);
        return true;
      },
    );
    stop();
    assert.equal(notified, 1);
  });

  it("keeps the server message on login and does not sign out", async () => {
    stubFetch(401, { error: "Invalid email or password." });
    let notified = 0;
    const stop = onUnauthorized(() => {
      notified += 1;
    });
    await assert.rejects(
      () => apiFetch("/api/auth/login", { method: "POST", body: "{}" }),
      /Invalid email or password/,
    );
    stop();
    assert.equal(notified, 0);
  });

  it("treats /api/auth/me as a probe", () => {
    assert.equal(isSessionProbePath("/api/auth/me"), true);
    assert.equal(isSessionProbePath("/api/machines"), false);
  });
});

describe("loginHrefForSignedOut", () => {
  it("carries the current path and the signed-out reason", () => {
    assert.equal(
      loginHrefForSignedOut("/care/tickets/abc?x=1"),
      "/login?next=%2Fcare%2Ftickets%2Fabc%3Fx%3D1&reason=signed-out",
    );
  });
  it("omits next for landing and login", () => {
    assert.equal(loginHrefForSignedOut("/"), "/login?reason=signed-out");
    assert.equal(loginHrefForSignedOut("/login?reason=signed-out"), "/login?reason=signed-out");
  });
});
