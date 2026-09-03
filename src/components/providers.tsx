"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { BugReportControl } from "@/components/bug-report/BugReportControl";
import { AppShell } from "@/components/nav/AppShell";
import { installClientLogCapture } from "@/lib/bug-report/client-logs";

installClientLogCapture();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
      <BugReportControl />
    </AuthProvider>
  );
}
