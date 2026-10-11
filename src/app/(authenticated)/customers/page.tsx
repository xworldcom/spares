import { redirect } from "next/navigation";
import { directoryHref } from "@/lib/directory-url";

/** Legacy bookmark — same target as `/staff/customers`. */
export default function CustomersLegacyRedirectPage() {
  redirect(directoryHref("person"));
}
