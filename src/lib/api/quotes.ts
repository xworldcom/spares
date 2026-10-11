import { quoteItemsPatchPayload } from "@/lib/quotes";
import { backgroundFetchHeaders } from "./background-fetch";
import { apiFetch } from "./client";
import { ApiError } from "./errors";
import { isAbortError } from "./fetch-deadline";
import { apiFetchList, invalidateListEtag } from "./list-fetch";
import { SPARES_WARM_HEADER } from "./warm-intent";
import { invalidateWarmRead, readIfWarm, warmRead } from "./warm-read";
import type {
  CreateQuoteResponse,
  Quote,
  QuoteItem,
  QuoteResponse,
  QuoteShipment,
  QuoteStatus,
  QuotesListResponse,
} from "./types";

export async function createQuote(input: {
  machineId: string;
  items: QuoteItem[];
  note?: string;
  customerId?: string;
}): Promise<Quote> {
  const data = await apiFetch<CreateQuoteResponse>("/api/quotes", {
    method: "POST",
    body: JSON.stringify({
      machineId: input.machineId,
      items: input.items,
      ...(input.note ? { note: input.note } : {}),
      ...(input.customerId ? { customerId: input.customerId } : {}),
    }),
  });
  invalidateWarmRead("quotes:list");
  invalidateListEtag("/api/quotes");
  invalidateWarmRead("care-hub:machines");
  invalidateWarmRead("machines:list");
  return data.quote;
}

const QUOTES_LIST_DEADLINE_MS = 20_000;

export async function listQuotes(options?: { background?: boolean }): Promise<QuotesListResponse> {
  const data = await apiFetchList<QuotesListResponse>(
    "/api/quotes",
    "quotes:list",
    {
      headers: options?.background ? backgroundFetchHeaders() : undefined,
      deadlineMs: QUOTES_LIST_DEADLINE_MS,
    },
  );
  return {
    quotes: data.quotes ?? [],
    unreadCount: data.unreadCount ?? 0,
  };
}

export async function getQuote(idOrNumber: string): Promise<Quote> {
  const warmKey = `quote:${idOrNumber}:view`;
  const load = async () => {
    const data = await apiFetch<QuoteResponse>(`/api/quotes/${idOrNumber}`);
    const quote = data.quote;
    invalidateWarmRead("quotes:list");
    invalidateListEtag("/api/quotes");
    warmRead(`quote:${quote.id}:view`, () => Promise.resolve(quote));
    warmRead(`quote:${String(quote.number)}:view`, () => Promise.resolve(quote));
    return quote;
  };
  try {
    return await readIfWarm(warmKey, load);
  } catch (cause) {
    invalidateWarmRead(warmKey);
    const retryable =
      isAbortError(cause) || (cause instanceof ApiError && cause.status === 0);
    if (!retryable) {
      throw cause;
    }
    return await readIfWarm(warmKey, load);
  }
}

export function warmQuoteDetailFetch(idOrNumber: string) {
  return apiFetch<QuoteResponse>(`/api/quotes/${idOrNumber}`, {
    headers: { [SPARES_WARM_HEADER]: "1" },
  }).then((data) => data.quote);
}

export async function updateQuote(
  idOrNumber: string,
  patch: {
    status?: QuoteStatus;
    items?: QuoteItem[];
    shipments?: Array<Omit<QuoteShipment, "id"> & { id?: string }>;
    poNumber?: string;
    invoiceNumber?: string | null;
    recordVersion?: number;
    unlockStaffPricing?: boolean;
  },
): Promise<Quote> {
  const body =
    patch.items != null
      ? { ...patch, items: quoteItemsPatchPayload(patch.items) }
      : patch;
  const data = await apiFetch<QuoteResponse>(`/api/quotes/${idOrNumber}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  invalidateWarmRead(`quote:${idOrNumber}`);
  invalidateWarmRead("quotes:list");
  invalidateListEtag("/api/quotes");
  return data.quote;
}

export async function setQuoteAssistantPaused(idOrNumber: string, paused: boolean) {
  const data = await apiFetch<QuoteResponse>(`/api/quotes/${idOrNumber}/assistant`, {
    method: "PATCH",
    body: JSON.stringify({ paused }),
  });
  invalidateWarmRead(`quote:${idOrNumber}`);
  invalidateWarmRead("quotes:list");
  invalidateListEtag("/api/quotes");
  return data.quote;
}

export async function postQuoteActivity(
  idOrNumber: string,
  input: { text: string; attachments?: import("@/types").ChatAttachment[] },
): Promise<Quote> {
  const data = await apiFetch<QuoteResponse>(`/api/quotes/${idOrNumber}/activity`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  invalidateWarmRead(`quote:${idOrNumber}`);
  return data.quote;
}

export async function patchQuoteRead(idOrNumber: string) {
  const data = await apiFetch<QuoteResponse>(`/api/quotes/${idOrNumber}/read`, {
    method: "PATCH",
  });
  invalidateWarmRead(`quote:${idOrNumber}`);
  invalidateWarmRead("quotes:list");
  invalidateListEtag("/api/quotes");
  return data.quote;
}

export async function uploadQuotePo(
  idOrNumber: string,
  input: { file: File; poNumber?: string },
): Promise<Quote> {
  const form = new FormData();
  form.set("file", input.file);
  if (input.poNumber) {
    form.set("poNumber", input.poNumber);
  }
  const data = await apiFetch<QuoteResponse>(`/api/quotes/${idOrNumber}/po`, {
    method: "POST",
    body: form,
  });
  invalidateWarmRead(`quote:${idOrNumber}`);
  invalidateWarmRead("quotes:list");
  invalidateListEtag("/api/quotes");
  return data.quote;
}

export function quotePoUrl(idOrNumber: string) {
  return `/api/quotes/${idOrNumber}/po`;
}
