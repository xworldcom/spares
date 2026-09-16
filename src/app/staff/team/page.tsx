import { redirect } from "next/navigation";

/** Team merged into People — staff live under the Staff segment. */
export default function StaffTeamPage() {
  redirect("/staff/people?tab=staff");
}
