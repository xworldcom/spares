import { redirect } from "next/navigation";
import { directoryHref } from "@/lib/directory-url";

/** Team merged into Directory — staff live under the Staff filter. */
export default function StaffTeamPage() {
  redirect(directoryHref("staff"));
}
