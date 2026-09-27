/** Skip mark-as-read side effects on conversation GET used only for prefetch warming. */
export const SPARES_WARM_HEADER = "X-Spares-Warm";

export function isWarmConversationRequest(request: Request) {
  return request.headers.get(SPARES_WARM_HEADER) === "1";
}
