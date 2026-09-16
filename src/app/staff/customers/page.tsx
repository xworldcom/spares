import { redirect } from "next/navigation";
import { directoryHref } from "@/lib/directory-url";

export default function StaffCustomersRedirectPage() {
  redirect(directoryHref("person"));
}
