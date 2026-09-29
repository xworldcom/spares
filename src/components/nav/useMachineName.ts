"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useMachineRouteBootstrap } from "@/components/nav/MachineRouteContext";
import { getMachine } from "@/lib/api/machines";
import {
  readMachineNameCache,
  rememberMachineName,
} from "@/lib/machine-name-cache";

function resolveSeed(
  machineId: string,
  bootstrap: { id: string; name: string } | null,
) {
  const cached = readMachineNameCache(machineId);
  if (cached) {
    return cached;
  }
  if (bootstrap?.id === machineId && bootstrap.name.trim()) {
    rememberMachineName(machineId, bootstrap.name);
    return bootstrap.name.trim();
  }
  return null;
}

export function useMachineName(machineId: string | null) {
  const { user } = useAuth();
  const bootstrap = useMachineRouteBootstrap();
  const [resolved, setResolved] = useState<{ id: string; name: string } | null>(
    () => {
      if (!machineId) {
        return null;
      }
      const seeded = resolveSeed(machineId, bootstrap);
      return seeded ? { id: machineId, name: seeded } : null;
    },
  );

  useEffect(() => {
    if (!machineId) {
      setResolved(null);
      return;
    }

    const seeded = resolveSeed(machineId, bootstrap);
    if (seeded) {
      setResolved({ id: machineId, name: seeded });
      return;
    }

    let cancelled = false;
    getMachine(machineId, user?.role)
      .then((machine) => {
        if (cancelled) {
          return;
        }
        const name = machine.name.trim() || "Machine";
        rememberMachineName(machineId, name);
        setResolved({ id: machineId, name });
      })
      .catch(() => {
        if (!cancelled) {
          setResolved({ id: machineId, name: "Machine" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrap, machineId, user?.role]);

  if (!machineId) {
    return null;
  }
  return resolved?.id === machineId ? resolved.name : null;
}
