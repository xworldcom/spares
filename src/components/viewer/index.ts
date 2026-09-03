"use client";

import type { ComponentType } from "react";
import dynamic from "next/dynamic";
import type { PartPickerProps } from "./types";

export type { PartPickerProps, UnmatchedMesh, ViewerPart } from "./types";

export const PartPicker: ComponentType<PartPickerProps> = dynamic(
  () => import("./PartPicker").then((mod) => mod.PartPicker),
  { ssr: false },
);
