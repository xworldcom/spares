"use client";

import { useEffect, useRef } from "react";
import {
  invalidateConversationWarmRead,
  waitForConversationWatch,
} from "@/lib/api/chat-watch";
import type { ChatWatchKind } from "@/lib/chat-watch";

const SAFETY_REFRESH_MS = 60_000;

/** Wait for a doorbell tap instead of asking the server every 1.5s. */
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

    let cancelled = false;
    let since = 0;
    const controller = new AbortController();

    async function poke() {
      invalidateConversationWarmRead(target.kind, target.id);
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
          await poke();
        }
        try {
          const next = await waitForConversationWatch({
            kind: target.kind,
            id: target.id,
            since,
            signal: controller.signal,
          });
          if (cancelled) {
            return;
          }
          const changed = next.changed && next.rev > since;
          since = next.rev;
          if (changed) {
            await poke();
          }
        } catch {
          if (cancelled) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }
    }

    void listen();
    const safety = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void poke();
      }
    }, SAFETY_REFRESH_MS);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(safety);
    };
  }, [enabled, target?.id, target?.kind]);
}
