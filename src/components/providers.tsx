"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { CareAlertsProvider } from "@/components/care/CareAlerts";
import { LifecycleAlertsProvider } from "@/components/notifications/LifecycleAlerts";
import { QuoteAlertsProvider } from "@/components/quote/QuoteAlerts";
import { DisplayTimeZoneProvider } from "@/components/display/DisplayTimeZoneProvider";
import { installClientLogCapture } from "@/lib/bug-report/client-logs";
import type { PublicUser } from "@/lib/api/types";
import { resolveDisplayTimeZone } from "@/lib/display-datetime";

installClientLogCapture();

export function Providers({
  children,
  initialUser,
  displayTimeZone,
}: {
  children: React.ReactNode;
  initialUser?: PublicUser | null;
  /** Same string on server and client for the request (defaults to Toronto). */
  displayTimeZone?: string | null;
}) {
  const timeZone = resolveDisplayTimeZone(displayTimeZone);
  return (
    <DisplayTimeZoneProvider timeZone={timeZone}>
    <AuthProvider initialUser={initialUser}>
      <CareAlertsProvider>
        <LifecycleAlertsProvider>
        <QuoteAlertsProvider>
          {children}
        </QuoteAlertsProvider>
        </LifecycleAlertsProvider>
      </CareAlertsProvider>
    </AuthProvider>
    </DisplayTimeZoneProvider>
  );
}
