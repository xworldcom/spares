import { warmRead } from "@/lib/api/warm-read";
import { quoteHref } from "@/lib/quotes";
import { rememberQuoteForNav } from "@/lib/nav/quote-list-seed";
import type { Quote, Role } from "@/types";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

export function primeQuoteDetailNav(quote: Quote) {
  rememberQuoteForNav(quote);
  warmRead(`quote:${quote.id}:view`, async () => quote);
  warmRead(`quote:${String(quote.number)}:view`, async () => quote);
}

function prefersReducedMotion() {
  if (typeof window === "undefined") {
    return true;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function navigateToQuoteDetail(
  router: AppRouterInstance,
  role: Role,
  quote: Quote,
) {
  primeQuoteDetailNav(quote);
  const href = quoteHref(role, quote);
  const go = () => {
    router.push(href);
  };
  if (
    typeof document !== "undefined" &&
    !prefersReducedMotion() &&
    typeof document.startViewTransition === "function"
  ) {
    document.documentElement.classList.add("is-quote-timeline-handoff");
    void document.startViewTransition(go).finished.finally(() => {
      document.documentElement.classList.remove("is-quote-timeline-handoff");
    });
    return;
  }
  go();
}
