import { redirect } from "next/navigation";

export default function LegacyStaffNotificationsRedirect() {
  redirect("/staff/part-alerts");
}
