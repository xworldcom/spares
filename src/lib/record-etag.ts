import { readRecordVersion } from "./record-meta.ts";

export function quoteRecordEtag(quote: {
  id: string;
  recordVersion?: number;
  activities?: { length: number };
}) {
  const version = readRecordVersion(quote);
  const tail = quote.activities?.length ?? 0;
  return `W/"quote-${quote.id}-v${version}-a${tail}"`;
}

export function ticketRecordEtag(ticket: {
  id: string;
  recordVersion?: number;
  activities?: { length: number };
}) {
  const version = readRecordVersion(ticket);
  const tail = ticket.activities?.length ?? 0;
  return `W/"ticket-${ticket.id}-v${version}-a${tail}"`;
}

export function etagMatches(request: Request, etag: string) {
  const header = request.headers.get("If-None-Match");
  if (!header) {
    return false;
  }
  return header.split(",").some((part) => part.trim() === etag);
}
