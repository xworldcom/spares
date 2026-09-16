import { getSignInOptions } from "@/lib/auth/password-login.server";
import { json } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET() {
  const options = await getSignInOptions();
  return json({
    passwordLoginEnabled: options.passwordLoginEnabled,
    microsoftSignInEnabled: options.microsoftSignInEnabled,
  });
}
