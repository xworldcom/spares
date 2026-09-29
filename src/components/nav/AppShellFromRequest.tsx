import { headers } from "next/headers";
import { AppShell } from "@/components/nav/AppShell";
import { resolveMachineBootstrapFromPath } from "@/lib/server/machine-route";

export async function AppShellFromRequest({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "";
  const bootstrap = await resolveMachineBootstrapFromPath(pathname);
  return <AppShell machineBootstrap={bootstrap}>{children}</AppShell>;
}
