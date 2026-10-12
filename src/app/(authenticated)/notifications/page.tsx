import { redirect } from "next/navigation";

export default function LegacyNotificationsRedirect() {
  redirect("/part-alerts");
}
