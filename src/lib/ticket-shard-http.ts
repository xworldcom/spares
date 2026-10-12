import { NextResponse } from "next/server";
import {
  TicketShardPersistError,
  ticketShardPersistErrorBody,
} from "./ticket-shard-persist.ts";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Map logged shard/Blob faults to a retryable API response (never silent 500). */
export function withTicketShardPersist<A extends unknown[], R extends Response | undefined>(
  handler: (...args: A) => Promise<R>,
) {
  return async (...args: A): Promise<R | Response> => {
    try {
      return await handler(...args);
    } catch (cause) {
      if (cause instanceof TicketShardPersistError) {
        return NextResponse.json(ticketShardPersistErrorBody(cause), {
          status: 503,
          headers: { ...NO_STORE, "Retry-After": "1" },
        });
      }
      throw cause;
    }
  };
}
