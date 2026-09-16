import { redirect } from "next/navigation";
import { directoryHref } from "@/lib/directory-url";

/** Legacy bookmark — same target as `/staff/team`. */
export default function TeamLegacyRedirectPage() {
  redirect(directoryHref("staff"));
}
