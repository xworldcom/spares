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
  /** True while the machine viewer chrome is in native or overlay fullscreen. */
  viewerFullscreen?: boolean;
  /** Bottom UI occlusion (px): shifts the visible 3D centre via setViewOffset only. */
  canvasBottomInsetPx?: number;
  layoutRootRef?: RefObject<HTMLDivElement | null>;
  hiddenIds?: readonly string[];
  isolatedId?: string | null;
  onSelect?: (part: ViewerPart | null) => void;
  onUnmatchedSelect?: (mesh: UnmatchedMesh | null) => void;
  onLongPress?: (part: ViewerPart) => void;
  className?: string;
};
