import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hubTicketsHref } from "@/lib/care";

export const metadata: Metadata = {
  title: "All tickets",
};

export default function StaffTicketsPage() {
  redirect(hubTicketsHref());
}
