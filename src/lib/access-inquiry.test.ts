import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accessInquiryFieldErrors,
  parseAccessInquiryBody,
  parseAccessInquiryStatusUpdate,
} from "./access-inquiry.ts";

describe("parseAccessInquiryBody", () => {
  it("requires core B2B fields", () => {
    const result = parseAccessInquiryBody({});
    assert.equal(result.ok, false);
    if (result.ok) {
      return;
    }
    assert.equal(result.status, 400);
    assert.equal(result.message, "Full name is required");
    const fields = accessInquiryFieldErrors({
      fullName: "",
      workEmail: "not-an-email",
      phone: "",
      companyName: "",
      roleTitle: "",
      customerType: "",
      message: "",
    });
    assert.equal(fields.fullName, "Full name is required");
    assert.equal(fields.workEmail, "A valid work email is required");
    assert.equal(fields.phone, "Phone number is required");
    assert.equal(fields.customerType, "Select what best describes your organization");
    assert.equal(fields.message, "Tell us what you are looking for");
  });

  it("rejects honeypot submissions", () => {
    const result = parseAccessInquiryBody({
      company_fax: "555-1212",
      fullName: "Pat Lee",
      workEmail: "pat@acme.com",
      phone: "555-0100",
      companyName: "Acme",
      roleTitle: "Maintenance manager",
      customerType: "end_customer",
      message: "Need spare parts workflow",
    });
    assert.equal(result.ok, false);
  });

  it("accepts a complete inquiry", () => {
    const result = parseAccessInquiryBody({
      fullName: "Pat Lee",
      workEmail: "Pat@Acme.COM",
      phone: "555-0100",
      companyName: "Acme Automation",
      website: "acme.com",
      roleTitle: "Maintenance manager",
      scaleNotes: "2 plants",
      customerType: "integrator",
      message: "We run OEM spare programs for customers.",
      referralNotes: "Trade show",
    });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.value.workEmail, "pat@acme.com");
    assert.match(result.value.website, /^https:\/\//);
    assert.equal(result.value.customerType, "integrator");
  });
});

describe("parseAccessInquiryStatusUpdate", () => {
  it("accepts known workflow statuses", () => {
    const result = parseAccessInquiryStatusUpdate({ status: "in_review" });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.status, "in_review");
  });

  it("rejects unknown statuses", () => {
    const result = parseAccessInquiryStatusUpdate({ status: "spam" });
    assert.equal(result.ok, false);
  });
});
