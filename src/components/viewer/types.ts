export type ViewerPart = {
  id: string;
  name: string;
  meshName: string;
  qty: number;
};

export type UnmatchedMesh = {
  meshName: string;
};

export type PartPickerProps = {
  src: string;
  parts: ViewerPart[];
  selectedId?: string | null;
  onSelect?: (part: ViewerPart | null) => void;
  onUnmatchedSelect?: (mesh: UnmatchedMesh | null) => void;
  className?: string;
};
