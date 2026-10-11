import { AppShell } from "@/components/nav/AppShell";
import { Providers } from "@/components/providers";

/** Marketing `/` only: no cookies(), headers(), or catalog session read — enables ISR. */
export default function PublicMarketingLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  );
}
