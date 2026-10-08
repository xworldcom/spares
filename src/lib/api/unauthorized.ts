/** Routes that legitimately return 401 without meaning "your session ended". */
const SESSION_PROBE_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/sign-in-options",
]);

export const SIGNED_OUT_MESSAGE = "You were signed out. Sign in again to continue.";

export function isSessionProbePath(path: string) {
  const bare = path.split("?")[0] ?? path;
  return SESSION_PROBE_PATHS.has(bare);
}

type Listener = () => void;
const listeners = new Set<Listener>();

export function onUnauthorized(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyUnauthorized() {
  for (const listener of [...listeners]) {
    listener();
  }
}

export function loginHrefForSignedOut(currentPath: string) {
  const params = new URLSearchParams();
  if (currentPath && currentPath !== "/" && !currentPath.startsWith("/login")) {
    params.set("next", currentPath);
  }
  params.set("reason", "signed-out");
  return `/login?${params.toString()}`;
}

export const PUBLIC_SIGNED_OUT_PATHS = new Set(["/", "/login", "/inquire"]);
