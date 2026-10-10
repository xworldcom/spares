import type { Metadata, Viewport } from "next";
import { AppShellFromRequest } from "@/components/nav/AppShellFromRequest";
import { Providers } from "@/components/providers";
import { cookies } from "next/headers";
import { getCurrentUserReadOnly, SESSION_COOKIE } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "OEE360",
  description:
    "Private spare parts, quotes, and machine care.",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#07080a",
};

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

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initialUser = await initialSessionUser();
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers initialUser={initialUser}>
          <AppShellFromRequest>{children}</AppShellFromRequest>
        </Providers>
      </body>
    </html>
  );
}
