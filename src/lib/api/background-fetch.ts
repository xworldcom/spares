/** Background polls (tab badges) must not trip the global signed-out alert on transient 401. */
export const SPARES_BACKGROUND_FETCH = "x-spares-background-fetch";

export function backgroundFetchHeaders(): HeadersInit {
  return { [SPARES_BACKGROUND_FETCH]: "1" };
}
