import type { Part } from "@/lib/api/types";

/**
 * Contract for Drew’s T1.1 picker (rotate / zoom / pick).
 *
 * Mount a component that implements these props from this folder.
 * Fern owns chrome around the slot: part name, BOM, and the quote form.
 */
export type ViewerPickerProps = {
  /** Session-authenticated model URL, typically `/api/machines/:id/file`. */
  fileUrl: string;
  parts: Part[];
  selectedPartId: string | null;
  onPick: (partId: string | null) => void;
  onLoadError?: (message: string) => void;
  className?: string;
};
