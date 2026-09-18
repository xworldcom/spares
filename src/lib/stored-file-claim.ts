export class StoredFileClaimedError extends Error {
  readonly code = "file-taken" as const;

  constructor(kind: "model" | "manual" | "chat") {
    super(
      kind === "chat"
        ? "That attachment is already on another conversation."
        : kind === "manual"
          ? "That file is already attached to another manual."
          : "That model file is already attached to another machine.",
    );
    this.name = "StoredFileClaimedError";
  }
}

export function modelFileNameClaimed(
  machines: readonly { id: string; storedFileName: string }[],
  storedFileName: string,
  exceptMachineId?: string,
) {
  const name = storedFileName.trim();
  if (!name) {
    return false;
  }
  return machines.some(
    (row) => row.storedFileName === name && row.id !== exceptMachineId,
  );
}

export function manualFileNameClaimed(
  manuals: readonly { id: string; storedFileName: string }[],
  storedFileName: string,
  exceptManualId?: string,
) {
  return manuals.some(
    (row) => row.storedFileName === storedFileName && row.id !== exceptManualId,
  );
}

function activitiesHaveKey(
  activities: readonly { attachments?: readonly { r2Key: string }[] }[] | undefined,
  r2Key: string,
) {
  return (activities ?? []).some((activity) =>
    (activity.attachments ?? []).some((attachment) => attachment.r2Key === r2Key),
  );
}

export function chatKeyClaimed(
  quotes: readonly { id: string; activities?: readonly { attachments?: readonly { r2Key: string }[] }[] }[],
  tickets: readonly { id: string; activities?: readonly { attachments?: readonly { r2Key: string }[] }[] }[],
  r2Key: string,
  except?: { quoteId?: string; ticketId?: string },
) {
  for (const quote of quotes) {
    if (except?.quoteId && quote.id === except.quoteId) {
      continue;
    }
    if (activitiesHaveKey(quote.activities, r2Key)) {
      return true;
    }
  }
  for (const ticket of tickets) {
    if (except?.ticketId && ticket.id === except.ticketId) {
      continue;
    }
    if (activitiesHaveKey(ticket.activities, r2Key)) {
      return true;
    }
  }
  return false;
}
