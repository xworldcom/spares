export type MachineContextTab =
  | "model"
  | "overview"
  | "quotes"
  | "tickets"
  | "manuals"
  | "service";

export type MachineContextTabDef = {
  id: MachineContextTab;
  label: string;
};

export function machineIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/machines\/([^/]+)/);
  if (!match || match[1] === "new") {
    return null;
  }
  return match[1];
}

export function isMachineStagePath(pathname: string): boolean {
  return /^\/machines\/[^/]+$/.test(pathname) && pathname !== "/machines/new";
}

export function machineQuotesHref(machineId: string) {
  return `/machines/${machineId}/quotes`;
}

export function machineTabHref(machineId: string, tab: MachineContextTab): string {
  switch (tab) {
    case "model":
      return `/machines/${machineId}`;
    case "overview":
      return `/machines/${machineId}/care`;
    case "quotes":
      return machineQuotesHref(machineId);
    case "tickets":
      return `/machines/${machineId}/care/tickets`;
    case "manuals":
      return `/machines/${machineId}/care/manuals`;
    case "service":
      return `/machines/${machineId}/care/service`;
  }
}

export function machineContextTabFromPath(pathname: string): MachineContextTab | null {
  const machineId = machineIdFromPath(pathname);
  if (!machineId) {
    return null;
  }
  const rest = pathname.slice(`/machines/${machineId}`.length);
  if (!rest || rest === "/") {
    return "model";
  }
  if (rest === "/quotes" || rest.startsWith("/quotes/")) {
    return "quotes";
  }
  if (rest === "/care") {
    return "overview";
  }
  if (rest.startsWith("/care/tickets")) {
    return "tickets";
  }
  if (rest.startsWith("/care/manuals")) {
    return "manuals";
  }
  if (rest.startsWith("/care/service") || rest.startsWith("/care/usage")) {
    return "service";
  }
  return "overview";
}

export function machineContextTabs(staff: boolean): MachineContextTabDef[] {
  const tabs: MachineContextTabDef[] = [
    { id: "model", label: "Model" },
    { id: "overview", label: "Overview" },
    { id: "quotes", label: "Quotes" },
    { id: "tickets", label: "Tickets" },
    { id: "manuals", label: "Manuals" },
  ];
  if (staff) {
    tabs.push({ id: "service", label: "Service" });
  }
  return tabs;
}
