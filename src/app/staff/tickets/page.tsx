import { RequireAuth } from "@/components/auth/RequireAuth";
import { StaffTicketsQueue } from "@/components/care/StaffTicketsQueue";

export default function StaffTicketsPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-tight">Service tickets</h1>
          <p className="spares-muted mt-2 text-[15px] leading-relaxed">
            Queue across every machine. Status moves Open → In progress → Waiting
            on customer → Resolved → Closed.
          </p>
        </div>
        <StaffTicketsQueue />
      </div>
    </RequireAuth>
  );
}
