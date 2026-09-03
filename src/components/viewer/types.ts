import type { Part } from "@/types";

/**
 * Drew’s locked T1.1 picker contract.
 *
 * - `src` is `GET /api/machines/:id/file` (cookie session). Loaders must
 *   send the login cookie (`credentials: "include"`). Not a public blob URL.
 * - `parts` is the joined list only (`id` is the part number).
 * - `onSelect` receives `{ id, name, meshName, qty }`.
 *
 * Drew owns rotate / zoom / pan / highlight.
 * Fern owns chrome, selected-part name, and the quote form.
 */
export type PartPickerProps = {
  src: string;
  parts: Part[];
  onSelect: (part: Part) => void;
};

export type { Part };
