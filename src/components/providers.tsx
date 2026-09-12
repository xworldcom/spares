"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/nav/AppShell";
import { CareAlertsProvider } from "@/components/care/CareAlerts";
import { QuoteAlertsProvider } from "@/components/quote/QuoteAlerts";
import { installClientLogCapture } from "@/lib/bug-report/client-logs";

installClientLogCapture();

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <CareAlertsProvider>
        <QuoteAlertsProvider>
          <AppShell>{children}</AppShell>
        </QuoteAlertsProvider>
      </CareAlertsProvider>
    </AuthProvider>
  );
}
