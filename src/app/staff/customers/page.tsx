import { RequireAuth } from "@/components/auth/RequireAuth";
import { CreateCustomerForm } from "@/components/staff/CreateCustomerForm";

export default function StaffCustomersPage() {
  return (
    <RequireAuth role="staff">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Staff create customer accounts. There is no public registration.
          </p>
        </div>
        <CreateCustomerForm />
      </div>
    </RequireAuth>
  );
}
