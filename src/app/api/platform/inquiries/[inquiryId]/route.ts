import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import {
  accessInquiryCustomerTypeLabel,
  accessInquiryStatusLabel,
  parseAccessInquiryStatusUpdate,
} from "@/lib/access-inquiry";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { getAccessInquiry, updateAccessInquiryStatus } from "@/lib/store";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ inquiryId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const { inquiryId } = await params;
  const inquiry = await getAccessInquiry(inquiryId);
  if (!inquiry) {
    return error("Inquiry not found", 404);
  }

  return json({
    inquiry: {
      ...inquiry,
      statusLabel: accessInquiryStatusLabel(inquiry.status),
      customerTypeLabel: accessInquiryCustomerTypeLabel(inquiry.customerType),
    },
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const body = await readJson(request);
  if (isErrorResponse(body)) {
    return body;
  }

  const parsed = parseAccessInquiryStatusUpdate(body);
  if (!parsed.ok) {
    return error(parsed.message, parsed.status);
  }

  const { inquiryId } = await params;
  const updated = await updateAccessInquiryStatus(inquiryId, parsed.status);
  if (!updated) {
    return error("Inquiry not found", 404);
  }

  return json({
    inquiry: {
      ...updated,
      statusLabel: accessInquiryStatusLabel(updated.status),
      customerTypeLabel: accessInquiryCustomerTypeLabel(updated.customerType),
    },
  });
}
