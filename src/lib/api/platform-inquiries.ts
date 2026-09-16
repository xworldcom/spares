import { apiFetch } from "@/lib/api/client";

export type PlatformInquiryRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  statusLabel: string;
  fullName: string;
  workEmail: string;
  phone: string;
  companyName: string;
  website: string;
  roleTitle: string;
  scaleNotes: string;
  customerType: string;
  customerTypeLabel: string;
  message: string;
  referralNotes: string;
};

type ListResponse = { inquiries: PlatformInquiryRow[]; newCount: number };

export async function listPlatformInquiries() {
  return apiFetch<ListResponse>("/api/platform/inquiries");
}

export async function getPlatformInquiry(id: string) {
  return apiFetch<{ inquiry: PlatformInquiryRow }>(
    `/api/platform/inquiries/${encodeURIComponent(id)}`,
  );
}

export async function updatePlatformInquiryStatus(id: string, status: string) {
  return apiFetch<{ inquiry: PlatformInquiryRow }>(
    `/api/platform/inquiries/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
}
