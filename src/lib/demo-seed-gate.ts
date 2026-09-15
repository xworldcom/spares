import { isSeedAllowed } from "./production-env.ts";

/** Built-in preview/demo accounts (see README). Never valid on Production Vercel. */
const BUILTIN_DEMO_SEED_EMAILS = new Set([
  "staff@spares.local",
  "customer@spares.local",
  "buyer@acme.test",
  "mill@example.test",
  "corp@cargill.test",
]);

export function isBuiltinDemoSeedEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 && BUILTIN_DEMO_SEED_EMAILS.has(normalized);
}

/** Fail closed: demo credentials cannot sign in when seeds are disabled (Production). */
export function isDemoSeedLoginBlocked(email: string) {
  return !isSeedAllowed() && isBuiltinDemoSeedEmail(email);
}
