import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bugReportIssueBody,
  bugReportTitle,
  bugReportUserLabel,
  parseJpegBase64,
  stripSecrets,
} from "./format.ts";

describe("stripSecrets", () => {
  it("redacts password fields in JSON-like text", () => {
    assert.equal(
      stripSecrets('{"email":"a@b.c","password":"SparesStaff1!"}'),
      '{"email":"a@b.c","password":"[redacted]"}',
    );
  });

  it("redacts password query params and assignments", () => {
    assert.equal(
      stripSecrets("https://example.test/login?password=secret&x=1"),
      "https://example.test/login?password=[redacted]&x=1",
    );
    assert.equal(stripSecrets("password: hunter2"), "password=[redacted]");
  });
});

describe("bugReportTitle", () => {
  it("prefixes and clips the description to 70 characters", () => {
    const long = "x".repeat(80);
    assert.equal(bugReportTitle(`  ${long}  `), `[bug-report] ${"x".repeat(70)}`);
  });
});

describe("bugReportIssueBody", () => {
  it("includes description, path, user, and a fenced log", () => {
    const body = bugReportIssueBody({
      description: "Canvas is blank",
      path: "/machines/abc",
      userLabel: "staff@spares.local (staff)",
      userAgent: "TestAgent/1",
      logText: "error boom",
      screenshotUrl: "https://example.test/shot.jpg",
    });
    assert.match(body, /Canvas is blank/);
    assert.match(body, /\/machines\/abc/);
    assert.match(body, /staff@spares\.local \(staff\)/);
    assert.match(body, /```\nerror boom\n```/);
    assert.match(body, /!\[Page screenshot\]\(https:\/\/example\.test\/shot\.jpg\)/);
  });
});

describe("bugReportUserLabel", () => {
  it("falls back to signed out", () => {
    assert.equal(bugReportUserLabel(), "signed out");
    assert.equal(bugReportUserLabel("a@b.c", "customer"), "a@b.c (customer)");
  });
});

describe("parseJpegBase64", () => {
  it("accepts a data URL or raw base64", () => {
    const raw = Buffer.from("jpeg-bytes").toString("base64");
    assert.deepEqual(parseJpegBase64(`data:image/jpeg;base64,${raw}`), Buffer.from("jpeg-bytes"));
    assert.deepEqual(parseJpegBase64(raw), Buffer.from("jpeg-bytes"));
    assert.equal(parseJpegBase64(""), null);
  });
});
