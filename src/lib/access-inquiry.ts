import { canAccessPlatformAdmin } from "./platform-admin.ts";

export const ACCESS_INQUIRY_STATUSES = [
  "new",
  "in_review",
  "accepted",
  "declined",
] as const;

export type AccessInquiryStatus = (typeof ACCESS_INQUIRY_STATUSES)[number];

export const ACCESS_INQUIRY_CUSTOMER_TYPES = [
  "oem",
  "integrator",
  "end_customer",
  "other",
] as const;

export type AccessInquiryCustomerType =
  (typeof ACCESS_INQUIRY_CUSTOMER_TYPES)[number];

export type AccessInquiryInput = {
  fullName: string;
  workEmail: string;
  phone: string;
  companyName: string;
  website: string;
  roleTitle: string;
  scaleNotes: string;
  customerType: AccessInquiryCustomerType;
  message: string;
  referralNotes: string;
};

type ParseResult =
  | { ok: true; value: AccessInquiryInput }
  | { ok: false; message: string; status: number };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clip(value: string, max: number) {
  return value.length > max ? value.slice(0, max) : value;
}

function optionalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.hostname.includes(".")) {
      return trimmed;
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

function normalizeCustomerType(raw: unknown): AccessInquiryCustomerType | null {
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "end-customer") {
    return "end_customer";
  }
  return ACCESS_INQUIRY_CUSTOMER_TYPES.includes(normalized as AccessInquiryCustomerType)
    ? (normalized as AccessInquiryCustomerType)
    : null;
}

export function parseAccessInquiryBody(body: unknown): ParseResult {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid request body", status: 400 };
  }
  const record = body as Record<string, unknown>;

  if (typeof record.company_fax === "string" && record.company_fax.trim()) {
    return { ok: false, message: "Could not submit inquiry", status: 400 };
  }

  const fullName =
    typeof record.fullName === "string" ? clip(record.fullName.trim(), 120) : "";
  const workEmail =
    typeof record.workEmail === "string"
      ? clip(record.workEmail.trim().toLowerCase(), 200)
      : "";
  const phone = typeof record.phone === "string" ? clip(record.phone.trim(), 40) : "";
  const companyName =
    typeof record.companyName === "string"
      ? clip(record.companyName.trim(), 200)
      : "";
  const website =
    typeof record.website === "string" ? clip(optionalUrl(record.website), 300) : "";
  const roleTitle =
    typeof record.roleTitle === "string" ? clip(record.roleTitle.trim(), 120) : "";
  const scaleNotes =
    typeof record.scaleNotes === "string" ? clip(record.scaleNotes.trim(), 500) : "";
  const message =
    typeof record.message === "string" ? clip(record.message.trim(), 4000) : "";
  const referralNotes =
    typeof record.referralNotes === "string"
      ? clip(record.referralNotes.trim(), 500)
      : "";
  const customerType = normalizeCustomerType(record.customerType);

  if (!fullName) {
    return { ok: false, message: "Full name is required", status: 400 };
  }
  if (!workEmail || !EMAIL_RE.test(workEmail)) {
    return { ok: false, message: "A valid work email is required", status: 400 };
  }
  if (!phone) {
    return { ok: false, message: "Phone number is required", status: 400 };
  }
  if (!companyName) {
    return { ok: false, message: "Company name is required", status: 400 };
  }
  if (!roleTitle) {
    return { ok: false, message: "Role or title is required", status: 400 };
  }
  if (!customerType) {
    return { ok: false, message: "Select what best describes your organization", status: 400 };
  }
  if (!message) {
    return { ok: false, message: "Tell us what you are looking for", status: 400 };
  }

  return {
    ok: true,
    value: {
      fullName,
      workEmail,
      phone,
      companyName,
      website,
      roleTitle,
      scaleNotes,
      customerType,
      message,
      referralNotes,
    },
  };
}

export function parseAccessInquiryStatusUpdate(body: unknown):
  | { ok: true; status: AccessInquiryStatus }
  | { ok: false; message: string; status: number } {
  if (!body || typeof body !== "object") {
    return { ok: false, message: "Invalid request body", status: 400 };
  }
  const raw = (body as { status?: unknown }).status;
  if (typeof raw !== "string") {
    return { ok: false, message: "status is required", status: 400 };
  }
  const normalized = raw.trim().toLowerCase() as AccessInquiryStatus;
  if (!ACCESS_INQUIRY_STATUSES.includes(normalized)) {
    return { ok: false, message: "Unknown status", status: 400 };
  }
  return { ok: true, status: normalized };
}

/** Same gate as `/api/platform/inquiries` — platform owner staff only. */
export function canManageAccessInquiries(email: string) {
  return canAccessPlatformAdmin(email);
}

export function accessInquiryStatusLabel(status: AccessInquiryStatus) {
  switch (status) {
    case "new":
      return "New";
    case "in_review":
      return "In review";
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
  }
}

export function accessInquiryCustomerTypeLabel(type: AccessInquiryCustomerType) {
  switch (type) {
    case "oem":
      return "OEM";
    case "integrator":
      return "Integrator";
    case "end_customer":
      return "End customer";
    case "other":
      return "Other";
  }
}
