import type { Metadata } from "next";
import { ViewerPlayground } from "./playground";

export const metadata: Metadata = {
  title: "Spares viewer (dev) — private, not live",
  robots: { index: false, follow: false },
};

export default function DevViewerPage() {
  return <ViewerPlayground />;
}
