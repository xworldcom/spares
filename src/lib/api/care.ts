import {
  isManualFilename,
  MANUAL_MAX_BYTES,
  manualContentType,
  manualOverLimitMessage,
} from "../care.ts";
import { ApiError } from "./errors";
import { apiFetch } from "./client";
import { apiFetchList } from "./list-fetch";
import { SPARES_WARM_HEADER } from "./warm-intent";
import { invalidateWarmRead, readIfWarm } from "./warm-read";
import type {
  CareOverviewResponse,
  MachineUsage,
  ManualCategory,
  ManualResponse,
  ManualsListResponse,
  PublicMachineManual,
  ServiceTicket,
  TicketResponse,
  TicketsListResponse,
  TicketStatus,
  UsageResponse,
} from "./types";

export async function getCareOverview(machineId: string) {
  return readIfWarm(`care-overview:${machineId}`, () =>
    apiFetch<CareOverviewResponse>(`/api/machines/${machineId}/care`),
  );
}

export async function listManuals(machineId: string) {
  const data = await apiFetch<ManualsListResponse>(
    `/api/machines/${machineId}/manuals`,
  );
  return data.manuals ?? [];
}

async function uploadManualToS3(machineId: string, file: File) {
  const ticket = await apiFetch<{
    uploadUrl: string;
    storedFileName: string;
    method?: string;
  }>(`/api/machines/${machineId}/manuals/upload`, {
    method: "POST",
    body: JSON.stringify({ originalFileName: file.name }),
  });
  const response = await fetch(ticket.uploadUrl, {
    method: ticket.method ?? "PUT",
    body: file,
    headers: { "Content-Type": manualContentType(file.name) },
  });
  if (!response.ok) {
    throw new Error(`Could not upload the manual to storage (${response.status}).`);
  }
  return ticket.storedFileName;
}

export async function uploadManual(
  machineId: string,
  input: { title: string; category: ManualCategory; file: File },
): Promise<PublicMachineManual> {
  if (!isManualFilename(input.file.name)) {
    throw new ApiError("Manual must be a PDF or Word document.", 400);
  }
  if (input.file.size > MANUAL_MAX_BYTES) {
    throw new ApiError(manualOverLimitMessage(input.file.size), 413);
  }

  let availability: { s3Upload?: boolean } | null = null;
  try {
    availability = await apiFetch<{ s3Upload?: boolean }>(
      `/api/machines/${machineId}/manuals/upload`,
    );
  } catch {
    availability = null;
  }

  if (availability?.s3Upload) {
    const storedFileName = await uploadManualToS3(machineId, input.file);
    const data = await apiFetch<ManualResponse>(`/api/machines/${machineId}/manuals`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        category: input.category,
        storedFileName,
        originalFileName: input.file.name,
        sizeBytes: input.file.size,
      }),
    });
    return data.manual;
  }

  const form = new FormData();
  form.set("title", input.title);
  form.set("category", input.category);
  form.set("file", input.file);
  const data = await apiFetch<ManualResponse>(`/api/machines/${machineId}/manuals`, {
    method: "POST",
    body: form,
  });
  return data.manual;
}

export async function listMachineTickets(machineId: string) {
  return readIfWarm(`tickets:machine:${machineId}`, async () => {
    const data = await apiFetch<TicketsListResponse>(
      `/api/machines/${machineId}/tickets`,
    );
    return {
      tickets: data.tickets ?? [],
      unreadCount: data.unreadCount ?? 0,
    };
  });
}

export async function listStaffTickets() {
  const data = await apiFetchList<TicketsListResponse>(
    "/api/staff/tickets",
    "tickets:staff",
  );
  return {
    tickets: data.tickets ?? [],
    unreadCount: data.unreadCount ?? 0,
  };
}

export async function listAccessibleTickets() {
  const data = await apiFetchList<TicketsListResponse>("/api/tickets", "tickets:accessible");
  return {
    tickets: data.tickets ?? [],
    unreadCount: data.unreadCount ?? 0,
  };
}

export async function createTicket(
  machineId: string,
  input: { title: string; note?: string },
): Promise<ServiceTicket> {
  const data = await apiFetch<TicketResponse>(`/api/machines/${machineId}/tickets`, {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      ...(input.note ? { note: input.note } : {}),
    }),
  });
  invalidateWarmRead("tickets:accessible");
  invalidateWarmRead(`tickets:machine:${machineId}`);
  return data.ticket;
}

export async function getTicket(idOrNumber: string): Promise<ServiceTicket> {
  return readIfWarm(`ticket:${idOrNumber}:view`, async () => {
    const data = await apiFetch<TicketResponse>(`/api/tickets/${idOrNumber}`);
    return data.ticket;
  });
}

/** Bypass warm-read cache — use after conflict Refresh or before retrying a write. */
export async function getTicketFresh(idOrNumber: string): Promise<ServiceTicket> {
  invalidateWarmRead(`ticket:${idOrNumber}`);
  const data = await apiFetch<TicketResponse>(`/api/tickets/${idOrNumber}`);
  return data.ticket;
}

export function warmTicketDetailFetch(idOrNumber: string) {
  return apiFetch<TicketResponse>(`/api/tickets/${idOrNumber}`, {
    headers: { [SPARES_WARM_HEADER]: "1" },
  }).then((data) => data.ticket);
}

export async function updateTicketStatus(
  id: string,
  status: TicketStatus,
  options?: { recordVersion?: number },
) {
  const data = await apiFetch<TicketResponse>(`/api/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      ...(options?.recordVersion != null ? { recordVersion: options.recordVersion } : {}),
    }),
  });
  invalidateWarmRead(`ticket:${id}`);
  invalidateWarmRead("tickets:accessible");
  return data.ticket;
}

export async function setTicketAssistantPaused(id: string, paused: boolean) {
  const data = await apiFetch<TicketResponse>(`/api/tickets/${id}/assistant`, {
    method: "PATCH",
    body: JSON.stringify({ paused }),
  });
  invalidateWarmRead(`ticket:${id}`);
  invalidateWarmRead("tickets:accessible");
  return data.ticket;
}

export async function postTicketActivity(
  id: string,
  input: { text: string; attachments?: import("@/types").ChatAttachment[] },
) {
  const data = await apiFetch<TicketResponse>(`/api/tickets/${id}/activity`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  invalidateWarmRead(`ticket:${id}`);
  return data.ticket;
}

export async function patchTicketRead(id: string) {
  const data = await apiFetch<TicketResponse>(`/api/tickets/${id}/read`, {
    method: "PATCH",
  });
  invalidateWarmRead(`ticket:${id}`);
  invalidateWarmRead("tickets:accessible");
  return data.ticket;
}

export async function getMachineUsage(machineId: string) {
  const data = await apiFetch<UsageResponse>(`/api/machines/${machineId}/usage`);
  return data.usage;
}

export async function updateMachineUsage(
  machineId: string,
  patch: {
    hours?: number | null;
    cycles?: number | null;
    lastServiceAt?: string | null;
    notes?: string | null;
  },
): Promise<MachineUsage | null> {
  const data = await apiFetch<UsageResponse>(`/api/machines/${machineId}/usage`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.usage;
}
