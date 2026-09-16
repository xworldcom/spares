import { LandingPageGate } from "@/components/landing/LandingPageGate";
import { getSignInOptions } from "@/lib/auth/password-login.server";

export const dynamic = "force-dynamic";

export default async function Home() {
  const signIn = await getSignInOptions();
  return (
    <LandingPageGate
      microsoftSignInEnabled={signIn.microsoftSignInEnabled}
      passwordLoginEnabled={signIn.passwordLoginEnabled}
    />
  );
}
