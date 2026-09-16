"use client";

import { useParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { ServicePanel } from "@/components/care/ServicePanel";

export default function MachineCareServiceLayout() {
  const params = useParams();
  const machineId = typeof params.id === "string" ? params.id : "";
  const visitId = typeof params.visitId === "string" ? params.visitId : undefined;
  return (
    <RequireAuth role="staff">
      <ServicePanel machineId={machineId} visitId={visitId} />
    </RequireAuth>
  );
}
