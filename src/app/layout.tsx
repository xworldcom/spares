import type { Metadata } from "next";
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

const CRITICAL_CSS = `
html,body{margin:0;min-height:100%;background:#f4f5f7;color:#0b0d10;color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased;}
@layer base{
a{color:inherit;text-decoration:none;}
button,input,textarea,select{font:inherit;color:inherit;}
}
button{cursor:pointer;border:0;background:transparent;}
.btn-primary{background:#0b0d10;color:#fff;}
.btn-accent{background:#0a84ff;color:#fff;}
.btn-danger{background:#7f1d1d;color:#fff;}
.btn-soft{background:#eceef2;color:#0b0d10;}
.viewer-chrome-chip{background:#f4f5f7;color:#0b0d10;-webkit-appearance:none;appearance:none;box-shadow:0 8px 24px rgba(0,0,0,.22);}
.viewer-chrome-shade{background:linear-gradient(to bottom,rgba(90,96,108,.62),rgba(11,13,16,0));}
.row-on-ink{background:#0b0d10;color:#fff;}
.row-on-ink .row-on-ink-muted{color:rgba(255,255,255,.72);}
.spares-muted{color:#4b4f57;}
.spares-app{min-height:100dvh;background:#f4f5f7;color:#0b0d10;}
.spares-app header{background:#f4f5f7;}
.spares-app a[href="/login"]{display:inline-flex;height:2.75rem;align-items:center;border-radius:999px;background:#0b0d10;color:#fff;padding:0 1rem;font-size:14px;font-weight:600;}
.login-input{display:block;box-sizing:border-box;height:3rem;width:100%;border:0;border-radius:1rem;background:#fff;padding:0 1rem;color:#0b0d10;box-shadow:inset 0 0 0 1px rgba(0,0,0,0.05);}
.login-submit{display:inline-flex;height:3rem;width:100%;align-items:center;justify-content:center;border:0;border-radius:999px;background:#0b0d10;color:#fff;font-size:17px;font-weight:600;}
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
