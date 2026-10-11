/** Fixed locale + TZ so SSR and browser hydration match (#418). */
export const SPARES_DISPLAY_LOCALE = "en-US";

/** Default when tenant/user timezone is unset (Spares host operations). */
export const SPARES_DEFAULT_DISPLAY_TIME_ZONE = "America/Toronto";

/** Active display TZ for format helpers (tenant override wiring uses the same resolver). */
export const SPARES_DISPLAY_TIME_ZONE = SPARES_DEFAULT_DISPLAY_TIME_ZONE;

function isValidIanaTimeZone(value: string) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Resolve stored tenant/user TZ with a stable fallback for SSR and client. */
export function resolveDisplayTimeZone(stored?: string | null) {
  const trimmed = stored?.trim();
  if (trimmed && isValidIanaTimeZone(trimmed)) {
    return trimmed;
  }
  return SPARES_DEFAULT_DISPLAY_TIME_ZONE;
}
