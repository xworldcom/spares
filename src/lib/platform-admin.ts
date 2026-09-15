import { isPlatformOwnerEmail } from "./tenant.ts";

/** Same gate as `/api/platform/*` and create-tenant flows. */
export function canAccessPlatformAdmin(email: string) {
  return isPlatformOwnerEmail(email);
}
