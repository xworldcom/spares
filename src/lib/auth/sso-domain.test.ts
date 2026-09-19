import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Tenant } from "../../types/index.ts";
import {
  emailSsoDomain,
  findActiveTenantForSsoDomain,
  firstTakenSsoDomain,
  formatSsoDomains,
  normalizeSsoDomain,
  parseSsoDomains,
} from "./sso-domain.ts";

function tenant(partial: Partial<Tenant> & Pick<Tenant, "id" | "ssoDomains">): Tenant {
  return {
    name: partial.name ?? partial.id,
    slug: partial.slug ?? partial.id,
    createdAt: "2026-09-19T00:00:00.000Z",
    ...partial,
  };
}

describe("normalizeSsoDomain", () => {
  it("strips @, scheme, and path", () => {
    assert.deepEqual(normalizeSsoDomain("https://Shape.com/login"), {
      ok: true,
      domain: "shape.com",
    });
    assert.deepEqual(normalizeSsoDomain("@SHAPE.com."), {
      ok: true,
      domain: "shape.com",
    });
  });

  it("rejects public inboxes and junk", () => {
    assert.deepEqual(normalizeSsoDomain("gmail.com"), { ok: false, reason: "public" });
    assert.deepEqual(normalizeSsoDomain("outlook.com"), { ok: false, reason: "public" });
    assert.deepEqual(normalizeSsoDomain("not a domain"), { ok: false, reason: "invalid" });
    assert.deepEqual(normalizeSsoDomain(""), { ok: false, reason: "empty" });
  });
});

describe("emailSsoDomain", () => {
  it("reads the domain from a work email", () => {
    assert.equal(emailSsoDomain("Jane@Shape.com"), "shape.com");
    assert.equal(emailSsoDomain("nobody"), null);
    assert.equal(emailSsoDomain("pat@gmail.com"), null);
  });
});

describe("parseSsoDomains", () => {
  it("accepts comma lists and de-dupes", () => {
    const parsed = parseSsoDomains("shape.com, Shape.com; shapetech.com");
    assert.deepEqual(parsed, { ok: true, domains: ["shape.com", "shapetech.com"] });
  });

  it("allows clearing with an empty string", () => {
    assert.deepEqual(parseSsoDomains(""), { ok: true, domains: [] });
    assert.deepEqual(parseSsoDomains([]), { ok: true, domains: [] });
  });

  it("rejects a public domain in a list", () => {
    const parsed = parseSsoDomains("shape.com, gmail.com");
    assert.equal(parsed.ok, false);
  });
});

describe("tenant SSO domain claims", () => {
  const shape = tenant({ id: "tenant-shape", ssoDomains: ["shape.com"] });
  const host = tenant({ id: "tenant-oee360-host", ssoDomains: ["huzevka.com"] });

  it("routes an active unique domain to that host", () => {
    assert.equal(findActiveTenantForSsoDomain([shape, host], "shape.com")?.id, "tenant-shape");
  });

  it("ignores suspended and deleted hosts for first-time SSO", () => {
    const suspended = tenant({
      id: "tenant-shape",
      ssoDomains: ["shape.com"],
      inactiveAt: "2026-09-19T00:00:00.000Z",
    });
    assert.equal(findActiveTenantForSsoDomain([suspended], "shape.com"), null);
  });

  it("fails closed when two hosts claim the same domain", () => {
    const other = tenant({ id: "tenant-other", ssoDomains: ["shape.com"] });
    assert.equal(findActiveTenantForSsoDomain([shape, other], "shape.com"), null);
  });

  it("treats a claimed domain as taken except on the same host", () => {
    assert.equal(firstTakenSsoDomain([shape, host], ["shape.com"]), "shape.com");
    assert.equal(firstTakenSsoDomain([shape, host], ["shape.com"], "tenant-shape"), null);
    assert.equal(formatSsoDomains(shape.ssoDomains), "shape.com");
  });
});
