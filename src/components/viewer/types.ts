export type ViewerPart = {
  id: string;
  name: string;
  meshName: string;
  qty: number;
};

export type UnmatchedMesh = {
  meshName: string;
};

import type { RefObject } from "react";

export type PartPickerProps = {
  src: string;
  parts: ViewerPart[];
  selectedId?: string | null;
  explode?: number;
  /** Bump to refit the camera to the current (exploded) assembly. */
  fitKey?: number;
  /** Bump to restore the first-load orbit pose (also clears explode in parent). */
  resetKey?: number;
  layoutRootRef?: RefObject<HTMLElement | null>;
  containFullscreenGestures?: boolean;
  hiddenIds?: readonly string[];
  isolatedId?: string | null;
  onSelect?: (part: ViewerPart | null) => void;
  onUnmatchedSelect?: (mesh: UnmatchedMesh | null) => void;
  onLongPress?: (part: ViewerPart) => void;
  className?: string;
};
