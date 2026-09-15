import { LandingPageGate } from "@/components/landing/LandingPageGate";
import { isMicrosoftSignInEnabled } from "@/lib/auth/microsoft";

export default function Home() {
  return <LandingPageGate microsoftSignInEnabled={isMicrosoftSignInEnabled()} />;
}
