"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { CareAlertsProvider } from "@/components/care/CareAlerts";
import { LifecycleAlertsProvider } from "@/components/notifications/LifecycleAlerts";
import { QuoteAlertsProvider } from "@/components/quote/QuoteAlerts";
import { installClientLogCapture } from "@/lib/bug-report/client-logs";
import type { PublicUser } from "@/lib/api/types";

installClientLogCapture();

export function Providers({
  children,
  initialUser,
}: {
  children: React.ReactNode;
  initialUser?: PublicUser | null;
}) {
  return (
    <AuthProvider initialUser={initialUser}>
      <CareAlertsProvider>
        <LifecycleAlertsProvider>
        <QuoteAlertsProvider>
          {children}
        </QuoteAlertsProvider>
        </LifecycleAlertsProvider>
      </CareAlertsProvider>
    </AuthProvider>
  );
}
