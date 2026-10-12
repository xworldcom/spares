import type { ServiceTicket } from "@/types";

/** Keep thread fields from `current` while syncing server record meta from `next`. */
export function mergeTicketPollState(
  current: ServiceTicket,
  next: ServiceTicket,
  activities: ServiceTicket["activities"],
): ServiceTicket {
  return {
    ...current,
    status: next.status,
    activities,
    unread: next.unread,
    customerReadReceipts: next.customerReadReceipts,
    assistantPaused: next.assistantPaused,
    assistantAvailable: next.assistantAvailable,
    recordVersion: next.recordVersion,
    lastModifiedAt: next.lastModifiedAt,
    lastModifiedByName: next.lastModifiedByName,
    actorDisplayNames: next.actorDisplayNames,
  };
}

export function ticketPollMetaInSync(current: ServiceTicket, next: ServiceTicket) {
  return (
    (current.recordVersion ?? 1) === (next.recordVersion ?? 1) &&
    current.lastModifiedAt === next.lastModifiedAt &&
    current.lastModifiedByName === next.lastModifiedByName
  );
}
