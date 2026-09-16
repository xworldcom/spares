import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import {
  accessInquiryCustomerTypeLabel,
  accessInquiryStatusLabel,
} from "@/lib/access-inquiry";
import { json } from "@/lib/http";
import { countNewAccessInquiries, listAccessInquiries } from "@/lib/store";

export const dynamic = "force-dynamic";

function publicInquiryRow(row: Awaited<ReturnType<typeof listAccessInquiries>>[number]) {
  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    status: row.status,
    statusLabel: accessInquiryStatusLabel(row.status),
    fullName: row.fullName,
    workEmail: row.workEmail,
    phone: row.phone,
    companyName: row.companyName,
    website: row.website,
    roleTitle: row.roleTitle,
    scaleNotes: row.scaleNotes,
    customerType: row.customerType,
    customerTypeLabel: accessInquiryCustomerTypeLabel(row.customerType),
    message: row.message,
    referralNotes: row.referralNotes,
  };
}

export async function GET() {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }

  const [inquiries, newCount] = await Promise.all([
    listAccessInquiries(),
    countNewAccessInquiries(),
  ]);

  return json({
    inquiries: inquiries.map(publicInquiryRow),
    newCount,
  });
}
