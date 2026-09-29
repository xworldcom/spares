"use client";

import { createContext, useContext } from "react";
import type { MachineNameSeed } from "@/lib/machine-name-cache";

const MachineRouteContext = createContext<MachineNameSeed | null>(null);

export function MachineRouteProvider({
  bootstrap,
  children,
}: {
  bootstrap: MachineNameSeed | null;
  children: React.ReactNode;
}) {
  return (
    <MachineRouteContext.Provider value={bootstrap}>
      {children}
    </MachineRouteContext.Provider>
  );
}

export function useMachineRouteBootstrap() {
  return useContext(MachineRouteContext);
}
