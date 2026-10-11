"use client";

import { createContext, useContext } from "react";
import { resolveDisplayTimeZone } from "@/lib/display-datetime";

const DisplayTimeZoneContext = createContext(resolveDisplayTimeZone());

export function DisplayTimeZoneProvider({
  timeZone,
  children,
}: {
  timeZone?: string | null;
  children: React.ReactNode;
}) {
  const resolved = resolveDisplayTimeZone(timeZone);
  return (
    <DisplayTimeZoneContext.Provider value={resolved}>
      {children}
    </DisplayTimeZoneContext.Provider>
  );
}

export function useDisplayTimeZone() {
  return useContext(DisplayTimeZoneContext);
}
