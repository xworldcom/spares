export type PartSheetAutoDismiss = "hide" | "isolate" | "add";

export function partSheetVisible(selectedId: string | null | undefined) {
  return selectedId != null && selectedId !== "";
}

export function shouldAutoDismissPartSheet(action: PartSheetAutoDismiss) {
  return action === "hide" || action === "isolate" || action === "add";
}

export type PartSheetRow = { label: string; value: string };

type PartSheetSource = {
  id: string;
  name: string;
  qty?: number;
  vendor?: string;
  stock?: string;
  material?: string;
  weight?: string;
  category?: string;
  replaces?: string;
};

function text(value: string | undefined) {
  return value?.trim() ?? "";
}

/**
 * Only fields the part record actually has; nothing is invented. `extra` is false when the
 * record carries nothing beyond number, name and quantity, so the sheet can say so.
 */
export function partSheetRows(part: PartSheetSource): { rows: PartSheetRow[]; extra: boolean } {
  const rows: PartSheetRow[] = [{ label: "Part number", value: part.id }];
  if (text(part.name)) {
    rows.push({ label: "Description", value: text(part.name) });
  }
  if (typeof part.qty === "number" && Number.isFinite(part.qty) && part.qty > 0) {
    rows.push({ label: "In this machine", value: `× ${part.qty}` });
  }
  const optional: Array<[string, string | undefined]> = [
    ["Vendor", part.vendor],
    ["Stock", part.stock],
    ["Material", part.material],
    ["Weight", part.weight],
    ["Category", part.category],
    ["Replaces", part.replaces],
  ];
  let extra = false;
  for (const [label, value] of optional) {
    if (text(value)) {
      rows.push({ label, value: text(value) });
      extra = true;
    }
  }
  return { rows, extra };
}

/** One quiet line under the part number: quantity and vendor when known. */
export function partSheetMetaLine(part: PartSheetSource): string {
  const bits: string[] = [];
  if (typeof part.qty === "number" && part.qty > 0) {
    bits.push(`× ${part.qty} in machine`);
  }
  if (text(part.vendor)) {
    bits.push(text(part.vendor));
  }
  if (text(part.stock)) {
    bits.push(`stock ${text(part.stock)}`);
  }
  return bits.join(" · ");
}
