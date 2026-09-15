import { LandingPageGate } from "@/components/landing/LandingPageGate";
import { isMicrosoftSignInEnabled } from "@/lib/auth/microsoft";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/machines";

  return (
    <LandingPageGate
      nextPath={nextPath}
      microsoftSignInEnabled={isMicrosoftSignInEnabled()}
      authErrorCode={error ?? null}
    />
  );
}
