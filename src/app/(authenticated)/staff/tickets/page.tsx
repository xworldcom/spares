import { redirect } from "next/navigation";
import { hubTicketsHref } from "@/lib/care";

export default function StaffTicketsPage() {
  redirect(hubTicketsHref());
}
