import { getCurrentUser } from "@/lib/auth";
import { derivedListEtagForScope } from "@/lib/derived-list-cache";
import { listScopeKey } from "@/lib/list-scope";
import { loadAccessibleTicketsListForSession } from "@/lib/tickets-list-server";
import { tenantIdForUser } from "@/lib/tenant";
import { CareHubTicketsClientLayout } from "./CareHubTicketsClientLayout";

export default async function CareHubTicketsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  const tenantId = user ? tenantIdForUser(user) : null;
  const initialList = await loadAccessibleTicketsListForSession();
  const listEtag =
    user && tenantId
      ? await derivedListEtagForScope(listScopeKey("tickets", tenantId, user))
      : null;

  return (
    <CareHubTicketsClientLayout initialList={initialList} listEtag={listEtag}>
      {children}
    </CareHubTicketsClientLayout>
  );
}
