import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spares",
  description: "Private industrial spare-parts platform. Not live.",
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e8e4dc",
};

const CRITICAL_CSS = `
html,body{margin:0;min-height:100%;background:#e8e4dc;color:#111214;color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
@layer base{
a{color:inherit;text-decoration:none;}
button,input,textarea,select{font:inherit;color:inherit;}
}
button{cursor:pointer;border:0;background:transparent;}
.btn-primary{background:#111214;color:#f3efe6;}
.btn-accent{background:#0a84ff;color:#fff;}
.btn-danger{background:#7f1d1d;color:#fff;}
.btn-soft{background:#ddd8ce;color:#111214;}
.viewer-chrome-chip{background:#1a2028;color:#f3efe6;-webkit-appearance:none;appearance:none;box-shadow:0 10px 28px rgba(0,0,0,.28);}
.viewer-chrome-shade{background:linear-gradient(to bottom,rgba(12,13,15,.42),rgba(18,22,28,0));}
.row-on-ink{background:#111214;color:#f3efe6;}
.row-on-ink .row-on-ink-muted{color:rgba(243,239,230,.68);}
.spares-muted{color:#534f48;}
.spares-surface{background:#f4f1ea;color:#111214;}
.spares-field{background:#ddd8ce;color:#111214;}
.spares-app{min-height:100dvh;background:#e8e4dc;color:#111214;overflow-x:clip;}
.spares-app header{background:#e8e4dc;padding-top:env(safe-area-inset-top,0px);}
.spares-app-login,.spares-app-login header{background:#0c0d0f;color:#f3efe6;}
.spares-header-inner{min-height:3.5rem;}
.spares-app a[href="/login"]{display:inline-flex;height:2.75rem;align-items:center;border-radius:999px;background:#111214;color:#f3efe6;padding:0 1rem;font-size:14px;font-weight:600;}
.login-input{display:block;box-sizing:border-box;height:3.15rem;width:100%;border:0;border-radius:.9rem;background:#181a1e;padding:0 1rem;color:#f3efe6;box-shadow:inset 0 0 0 1px rgba(243,239,230,0.08);}
.login-submit{display:inline-flex;height:3.15rem;width:100%;align-items:center;justify-content:center;border:0;border-radius:999px;background:#f3efe6;color:#0c0d0f;font-size:16px;font-weight:600;}
.login-submit:disabled{opacity:0.4;}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: CRITICAL_CSS }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
