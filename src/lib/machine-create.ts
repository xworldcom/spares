import {
  MAX_MACHINE_NAME,
  MAX_MACHINE_NOTES,
  MAX_MACHINE_OEM,
  normalizeMachineName,
} from "./machines.ts";

export type ModelLessMachineInput = {
  name: string;
  siteId: string;
  oem?: string;
  notes?: string;
};

function optionalText(value: unknown, max: number): string | undefined | null {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > max) {
    return null;
  }
  return trimmed;
}

export function parseModelLessMachineBody(
  body: unknown,
): { ok: true; value: ModelLessMachineInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Send a machine name and site." };
  }
  const record = body as {
    name?: unknown;
    siteId?: unknown;
    oem?: unknown;
    notes?: unknown;
  };
  const name = normalizeMachineName(
    typeof record.name === "string" ? record.name : "",
  );
  if (!name) {
    return { ok: false, error: "Enter a machine name." };
  }
  if (name.length > MAX_MACHINE_NAME) {
    return { ok: false, error: "Machine name is too long." };
  }
  const siteId = typeof record.siteId === "string" ? record.siteId.trim() : "";
  if (!siteId) {
    return { ok: false, error: "Choose a site for this machine." };
  }
  const oem = optionalText(record.oem, MAX_MACHINE_OEM);
  if (oem === null) {
    return { ok: false, error: "Maker is too long." };
  }
  const notes = optionalText(record.notes, MAX_MACHINE_NOTES);
  if (notes === null) {
    return { ok: false, error: "Notes are too long." };
  }
  const value: ModelLessMachineInput = { name, siteId };
  if (oem) {
    value.oem = oem;
  }
  if (notes) {
    value.notes = notes;
  }
  return { ok: true, value };
}
