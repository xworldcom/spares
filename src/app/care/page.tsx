import { redirect } from "next/navigation";
import { hubTicketsHref } from "@/lib/care";

export default function CareHubPage() {
  redirect(hubTicketsHref());
}
