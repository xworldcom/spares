"use client";

import { useEffect, useRef } from "react";
import {
  invalidateConversationWarmRead,
  waitForConversationWatch,
} from "@/lib/api/chat-watch";
import { isNotFound } from "@/lib/api/errors";
import type { ChatWatchKind } from "@/lib/chat-watch";

/** Wait for a doorbell tap. Reload only when a tap lands. */
export function useConversationWatch(
  enabled: boolean,
  target: { kind: ChatWatchKind; id: string } | null,
  onPoke: () => Promise<void>,
) {
  const pokeRef = useRef(onPoke);
  pokeRef.current = onPoke;

  useEffect(() => {
    if (!enabled || !target?.id) {
      return;
    }

    const watching = target;
    let cancelled = false;
    let since = 0;
    const controller = new AbortController();

    async function poke() {
      invalidateConversationWarmRead(watching.kind, watching.id);
      await pokeRef.current();
    }

    async function listen() {
      while (!cancelled) {
        if (document.visibilityState === "hidden") {
          await new Promise<void>((resolve) => {
            function onVisible() {
              if (document.visibilityState === "visible") {
                document.removeEventListener("visibilitychange", onVisible);
                resolve();
              }
            }
            document.addEventListener("visibilitychange", onVisible);
          });
          if (cancelled) {
            return;
          }
        }
        try {
          const next = await waitForConversationWatch({
            kind: watching.kind,
            id: watching.id,
            since,
            signal: controller.signal,
          });
          if (cancelled) {
            return;
          }
          const changed = next.changed && next.rev > since;
          since = Math.max(since, next.rev);
          if (changed) {
            await poke();
          }
        } catch (cause) {
          if (cancelled) {
            return;
          }
          if (isNotFound(cause)) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }
    }

    void listen();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, target?.id, target?.kind]);
}
