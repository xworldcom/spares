import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  corsPreflightResponse,
  isAllowedModelAssetOrigin,
  r2CorsOrigins,
  rejectDisallowedOrigin,
  shouldUseCrossOriginObjectUrl,
  SPARES_SOFT_LAUNCH_ORIGINS,
} from "./cors.ts";

describe("model asset CORS allowlist", () => {
  afterEach(() => {
    delete process.env.SPARES_CORS_ORIGINS;
  });

  it("includes Soft Launch aliases and localhost in the R2 bucket list", () => {
    const origins = r2CorsOrigins();
    for (const origin of SPARES_SOFT_LAUNCH_ORIGINS) {
      assert.ok(origins.includes(origin));
    }
    assert.ok(origins.includes("http://localhost:3000"));
  });

  it("merges SPARES_CORS_ORIGINS into the R2 bucket list", () => {
    process.env.SPARES_CORS_ORIGINS =
      "https://spares-git-main-xworldcom.vercel.app,https://extra.example.test";
    const origins = r2CorsOrigins();
    assert.ok(
      origins.includes("https://spares-git-main-xworldcom.vercel.app"),
    );
    assert.ok(origins.includes("https://extra.example.test"));
  });

  it("allows Spares Vercel preview hostnames", () => {
    assert.equal(
      isAllowedModelAssetOrigin("https://spares-git-main-xworldcom.vercel.app"),
      true,
    );
    assert.equal(
      isAllowedModelAssetOrigin("https://spares-yonder3.vercel.app"),
      true,
    );
  });

  it("rejects arbitrary third-party origins", () => {
    assert.equal(isAllowedModelAssetOrigin("https://evil.example.test"), false);
    assert.equal(
      isAllowedModelAssetOrigin("https://other-project.vercel.app"),
      false,
    );
    assert.equal(isAllowedModelAssetOrigin(null), false);
  });

  it("uses presigned object URLs only for bucket-listed origins", () => {
    const allowed = new Request("https://spares-yonder3.vercel.app/api/machines/m1", {
      headers: { Origin: "https://spares-yonder3.vercel.app" },
    });
    const preview = new Request(
      "https://spares-git-main-xworldcom.vercel.app/api/machines/m1",
      {
        headers: {
          Origin: "https://spares-git-main-xworldcom.vercel.app",
        },
      },
    );
    assert.equal(shouldUseCrossOriginObjectUrl(allowed), true);
    assert.equal(shouldUseCrossOriginObjectUrl(preview), false);
  });

  it("rejects disallowed Origin headers on asset routes", () => {
    const request = new Request("https://spares-yonder3.vercel.app/api/machines/model-upload", {
      method: "POST",
      headers: { Origin: "https://evil.example.test" },
    });
    const response = rejectDisallowedOrigin(request);
    assert.ok(response);
    assert.equal(response.status, 403);
  });

  it("answers OPTIONS preflight only for allowed origins", () => {
    const allowed = new Request("https://spares-yonder3.vercel.app/api/machines/m1/file", {
      method: "OPTIONS",
      headers: { Origin: "https://spares-yonder3.vercel.app" },
    });
    const blocked = new Request("https://spares-yonder3.vercel.app/api/machines/m1/file", {
      method: "OPTIONS",
      headers: { Origin: "https://evil.example.test" },
    });
    assert.equal(corsPreflightResponse(allowed).status, 204);
    assert.equal(corsPreflightResponse(blocked).status, 403);
  });
});
