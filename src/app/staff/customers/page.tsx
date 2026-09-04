import { RequireAuth } from "@/components/auth/RequireAuth";
import { CreateCustomerForm } from "@/components/staff/CreateCustomerForm";

export default function StaffCustomersPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">Customers</h1>
          <p className="spares-muted mt-1 text-sm">
            Staff create customer accounts. There is no public registration.
          </p>
        </div>
        <CreateCustomerForm />
      </div>
    </RequireAuth>
  );
}
