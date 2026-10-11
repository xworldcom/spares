import { RequireAuth } from "@/components/auth/RequireAuth";

export default function CareHubLayout({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
