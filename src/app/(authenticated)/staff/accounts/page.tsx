import { redirect } from "next/navigation";
import { directoryHref } from "@/lib/directory-url";

export default function StaffAccountsRedirectPage() {
  redirect(directoryHref("customer"));
}
