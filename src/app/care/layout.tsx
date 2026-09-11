import { RequireAuth } from "@/components/auth/RequireAuth";
import { CareHubFrame } from "@/components/care/CareHubFrame";

export default function CareHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <CareHubFrame>{children}</CareHubFrame>
    </RequireAuth>
  );
}
