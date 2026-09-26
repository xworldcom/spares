import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Tenant } from "../../types/index.ts";
import {
  emailSsoDomain,
  findActiveTenantForSsoDomain,
  firstTakenSsoDomain,
  formatSsoDomains,
  formatSsoTenantIds,
  MICROSOFT_CONSUMER_TID,
  normalizeSsoDomain,
  parseSsoAutoroute,
  parseSsoDomains,
  parseSsoTenantIds,
  tenantEnrollsMicrosoftTenant,
} from "./sso-domain.ts";

const SHAPE_TID = "11111111-2222-4333-8444-555555555555";
const OTHER_TID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

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

describe("parseSsoTenantIds", () => {
  it("accepts a GUID list, lowercases, and de-dupes", () => {
    assert.deepEqual(
      parseSsoTenantIds(`${SHAPE_TID.toUpperCase()}, ${SHAPE_TID}; ${OTHER_TID}`),
      { ok: true, tenantIds: [SHAPE_TID, OTHER_TID] },
    );
    assert.deepEqual(parseSsoTenantIds([SHAPE_TID]), { ok: true, tenantIds: [SHAPE_TID] });
  });

  it("allows clearing with an empty string", () => {
    assert.deepEqual(parseSsoTenantIds(""), { ok: true, tenantIds: [] });
    assert.deepEqual(parseSsoTenantIds(undefined), { ok: true, tenantIds: [] });
  });

  it("rejects non-GUID tokens", () => {
    assert.deepEqual(parseSsoTenantIds("shape.com"), {
      ok: false,
      message: "Enter an Entra tenant ID such as 11111111-2222-3333-4444-555555555555",
      status: 400,
    });
    assert.deepEqual(parseSsoTenantIds(42), {
      ok: false,
      message: "Entra tenant IDs must be text",
      status: 400,
    });
  });

  it("rejects the personal Microsoft account tenant", () => {
    assert.deepEqual(parseSsoTenantIds(`${SHAPE_TID}, ${MICROSOFT_CONSUMER_TID}`), {
      ok: false,
      message: "Personal Microsoft accounts cannot be enrolled as a host tenant",
      status: 400,
    });
  });

  it("formats the list back for the input", () => {
    assert.equal(formatSsoTenantIds([SHAPE_TID, OTHER_TID]), `${SHAPE_TID}, ${OTHER_TID}`);
    assert.equal(formatSsoTenantIds(undefined), "");
  });
});

describe("tenantEnrollsMicrosoftTenant", () => {
  it("is true only for an enrolled tid", () => {
    assert.equal(
      tenantEnrollsMicrosoftTenant({ ssoTenantIds: [SHAPE_TID] }, SHAPE_TID),
      true,
    );
    assert.equal(
      tenantEnrollsMicrosoftTenant({ ssoTenantIds: [SHAPE_TID] }, OTHER_TID),
      false,
    );
    assert.equal(tenantEnrollsMicrosoftTenant({}, SHAPE_TID), false);
    assert.equal(tenantEnrollsMicrosoftTenant(undefined, SHAPE_TID), false);
  });
});

describe("parseSsoAutoroute", () => {
  it("reads on/off from common encodings", () => {
    assert.equal(parseSsoAutoroute("on"), true);
    assert.equal(parseSsoAutoroute(true), true);
    assert.equal(parseSsoAutoroute("off"), false);
    assert.equal(parseSsoAutoroute(false), false);
    assert.equal(parseSsoAutoroute(undefined), undefined);
  });
});

describe("tenant SSO domain claims", () => {
  const shape = tenant({ id: "tenant-shape", ssoDomains: ["shape.com"] });
  const host = tenant({ id: "tenant-oee360-host", ssoDomains: ["huzevka.com"] });

  it("routes only when autoroute is on", () => {
    assert.equal(findActiveTenantForSsoDomain([shape, host], "shape.com"), null);
    const live = tenant({
      id: "tenant-shape",
      ssoDomains: ["shape.com"],
      ssoAutoroute: true,
    });
    assert.equal(findActiveTenantForSsoDomain([live, host], "shape.com")?.id, "tenant-shape");
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
