import { AppShellFromRequest } from "@/components/nav/AppShellFromRequest";
import { Providers } from "@/components/providers";
import { cookies } from "next/headers";
import { getCurrentUserReadOnly, SESSION_COOKIE } from "@/lib/auth";
import { resolveDisplayTimeZone } from "@/lib/display-datetime";

/** `undefined` = could not tell on the server, so the client asks `/api/auth/me`. */
async function initialSessionUser() {
  try {
    const user = await getCurrentUserReadOnly();
    if (user) {
      return user;
    }
    // A cookie that does not resolve may be revoked or just stale on this instance; let `/me` decide.
    return (await cookies()).has(SESSION_COOKIE) ? undefined : null;
  } catch {
    return undefined;
  }
}

export default async function AuthenticatedAppLayout({
  children,
}: LayoutProps<"/">) {
  const initialUser = await initialSessionUser();
  const displayTimeZone = resolveDisplayTimeZone();
  return (
    <Providers initialUser={initialUser} displayTimeZone={displayTimeZone}>
      <AppShellFromRequest>{children}</AppShellFromRequest>
    </Providers>
  );
}
