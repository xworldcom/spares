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

const CRITICAL_CSS = `
html,body{margin:0;min-height:100%;background:#0c0d0f;color:#eceae4;color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
html:has(.spares-app-cinematic),html:has(.spares-app-cinematic) body{overflow-x:visible;overflow-y:visible;scrollbar-width:none;}
@layer base{
a{color:inherit;text-decoration:none;}
button,input,textarea,select{font:inherit;color:inherit;}
button{cursor:pointer;border:0;background:transparent;}
}
.btn-primary{background:#eceae4;color:#0c0d0f;}
.btn-accent{background:#0a84ff;color:#fff;}
.btn-danger{background:#c23b3b;color:#fff;}
.btn-soft{background:#1c1f26;color:#eceae4;}
.viewer-chrome-chip{background:#1a2028;color:#eceae4;-webkit-appearance:none;appearance:none;box-shadow:0 10px 28px rgba(0,0,0,.28);}
.viewer-chrome-shade{background:linear-gradient(to bottom,rgba(12,13,15,.42),rgba(18,22,28,0));}
.row-on-ink{background:#eceae4;color:#0c0d0f;}
.row-on-ink .row-on-ink-muted{color:rgba(12,13,15,.62);}
.spares-muted{color:#a8a49c;}
.spares-surface{background:#16181d;color:#eceae4;}
.spares-field{background:#1c1f26;color:#eceae4;}
.spares-app{min-height:100dvh;background:#0c0d0f;color:#eceae4;overflow-x:clip;}
.spares-app-cinematic{overflow-x:visible;overflow-y:visible;}
.spares-app header.spares-header{background:#0c0d0f;padding-top:env(safe-area-inset-top,0px);}
.spares-app-login,.spares-app-login header.spares-header{background:#0c0d0f;color:#eceae4;}
.spares-app header:not(.spares-header){background:transparent;padding-top:0;}
.spares-header-inner{min-height:3.5rem;}
.spares-app header a.spares-header-sign-in{display:inline-flex;height:2.75rem;align-items:center;border-radius:999px;background:#eceae4;color:#0c0d0f;padding:0 1rem;font-size:14px;font-weight:600;}
.login-input{display:block;box-sizing:border-box;height:3.15rem;width:100%;border:0;border-radius:.9rem;background:#181a1e;padding:0 1rem;color:#eceae4;box-shadow:inset 0 0 0 1px rgba(236,234,228,0.08);}
.login-submit{display:inline-flex;height:3.15rem;width:100%;align-items:center;justify-content:center;border:0;border-radius:999px;background:#eceae4;color:#0c0d0f;font-size:16px;font-weight:600;}
.login-submit:disabled{opacity:0.4;}
`;

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
      <head>
        <style
          dangerouslySetInnerHTML={{ __html: CRITICAL_CSS }}
          suppressHydrationWarning
        />
      </head>
      <body className="min-h-screen antialiased">
        <Providers initialUser={initialUser}>
          <AppShellFromRequest>{children}</AppShellFromRequest>
        </Providers>
      </body>
    </html>
  );
}
