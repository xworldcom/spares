import { LandingPageGate } from "@/components/landing/LandingPageGate";
import { getSignInOptions } from "@/lib/auth/password-login.server";

/** Sign-in flags come from tiny platform-settings.json, not the catalog blob. */
export const revalidate = 3600;

export default async function Home() {
  const signIn = await getSignInOptions();
  return (
    <LandingPageGate
      microsoftSignInEnabled={signIn.microsoftSignInEnabled}
      passwordLoginEnabled={signIn.passwordLoginEnabled}
      showMarketing
    />
  );
}
