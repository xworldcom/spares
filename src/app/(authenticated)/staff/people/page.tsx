import { redirect } from "next/navigation";
import { directoryHref } from "@/lib/directory-url";

type PeoplePageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function StaffPeopleRedirectPage({ searchParams }: PeoplePageProps) {
  const params = await searchParams;
  redirect(directoryHref(params.tab === "staff" ? "staff" : "person"));
}
