import type { Metadata } from "next";
import { ViewerPlayground, type DevViewerPack } from "./playground";

export const metadata: Metadata = {
  title: "Spares viewer (dev) — private, not live",
  robots: { index: false, follow: false },
};

function resolvePack(
  value: string | string[] | undefined,
): DevViewerPack {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "palletizer" ? "palletizer" : "hardware";
}

export default async function DevViewerPage(props: PageProps<"/dev/viewer">) {
  const searchParams = await props.searchParams;
  return <ViewerPlayground pack={resolvePack(searchParams.pack)} />;
}
