"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getMachine } from "@/lib/api/machines";

export function useMachineName(machineId: string | null) {
  const { user } = useAuth();
  const [resolved, setResolved] = useState<{ id: string; name: string } | null>(
    null,
  );

  useEffect(() => {
    if (!machineId) {
      return;
    }
    let cancelled = false;
    getMachine(machineId, user?.role)
      .then((machine) => {
        if (!cancelled) {
          setResolved({ id: machineId, name: machine.name });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolved({ id: machineId, name: "Machine" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [machineId, user?.role]);

  if (!machineId) {
    return null;
  }
  return resolved?.id === machineId ? resolved.name : null;
}
