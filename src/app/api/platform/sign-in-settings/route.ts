import { getSignInOptions } from "@/lib/auth/password-login.server";
import { requirePlatformOwner } from "@/lib/auth/tenant-scope";
import { error, isErrorResponse, json, readJson } from "@/lib/http";
import { updatePlatformSignInSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

type PatchBody = {
  passwordLoginEnabled?: unknown;
};

export async function GET() {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const options = await getSignInOptions();
  return json({
    passwordLoginEnabled: options.passwordLoginEnabled,
    passwordLoginStoredEnabled: options.passwordLoginStoredEnabled,
    passwordLoginEnvOverride: options.passwordLoginEnvOverride,
    microsoftSignInEnabled: options.microsoftSignInEnabled,
  });
}

export async function PATCH(request: Request) {
  const auth = await requirePlatformOwner();
  if ("error" in auth) {
    return auth.error;
  }
  const body = await readJson<PatchBody>(request);
  if (isErrorResponse(body)) {
    return body;
  }
  if (typeof body.passwordLoginEnabled !== "boolean") {
    return error("passwordLoginEnabled must be a boolean", 400);
  }
  const { settings } = await updatePlatformSignInSettings({
    passwordLoginEnabled: body.passwordLoginEnabled,
  });
  const options = await getSignInOptions();
  return json({
    passwordLoginEnabled: options.passwordLoginEnabled,
    passwordLoginStoredEnabled: settings.passwordLoginEnabled !== false,
    passwordLoginEnvOverride: options.passwordLoginEnvOverride,
    microsoftSignInEnabled: options.microsoftSignInEnabled,
  });
}
