import type { Part } from "@/types";

/**
 * Drew’s locked T1.1 picker contract.
 *
 * - `src` is the same-origin path `/api/machines/:id/file`.
 *   PartPicker’s loader sends the login cookie on that `src`.
 *   Do NOT pre-fetch the GLB into a blob URL and pass that instead.
 * - `parts` is the joined list only (`id` is the part number).
 *   Unmatched stays off this list (staff panel only).
 * - `onSelect` receives `{ id, name, meshName, qty }`.
 *
 * Drew owns rotate / zoom / pan / highlight.
 * Fern owns chrome, selected-part name, and the quote form.
 */
export type PartPickerProps = {
  /** Same-origin `/api/machines/:id/file` — not a blob: URL. */
  src: string;
  parts: Part[];
  onSelect: (part: Part) => void;
};

export type { Part };
