import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPasswordQueryKey,
  stripCredentialQuery,
  stripCredentialSearchParams,
} from "./safe-url.ts";

describe("stripCredentialSearchParams", () => {
  it("strips password from the query string and keeps next", () => {
    const params = new URLSearchParams(
      "email=customer@spares.local&password=SparesCustomer1!&next=/machines",
    );
    assert.equal(stripCredentialSearchParams(params), true);
    assert.equal(params.get("password"), null);
    assert.equal(params.get("email"), "customer@spares.local");
    assert.equal(params.get("next"), "/machines");
  });

  it("strips password aliases case-insensitively", () => {
    const params = new URLSearchParams("Passwd=secret&PWD=also");
    assert.equal(stripCredentialSearchParams(params), true);
    assert.equal(params.toString(), "");
  });

  it("is a no-op when no password keys are present", () => {
    const params = new URLSearchParams("next=/machines");
    assert.equal(stripCredentialSearchParams(params), false);
    assert.equal(params.get("next"), "/machines");
  });
});

describe("stripCredentialQuery", () => {
  it("never leaves password in the returned href", () => {
    const result = stripCredentialQuery(
      "/login?email=a@b.c&password=leaked-secret&next=/machines",
    );
    assert.equal(result.stripped, true);
    assert.equal(result.href.includes("password"), false);
    assert.equal(result.href.includes("leaked-secret"), false);
    assert.equal(result.href, "/login?email=a%40b.c&next=%2Fmachines");
  });
});

describe("isPasswordQueryKey", () => {
  it("matches password keys only", () => {
    assert.equal(isPasswordQueryKey("password"), true);
    assert.equal(isPasswordQueryKey("PASSWORD"), true);
    assert.equal(isPasswordQueryKey("email"), false);
    assert.equal(isPasswordQueryKey("next"), false);
  });
});
