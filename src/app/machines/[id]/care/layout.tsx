import { RequireAuth } from "@/components/auth/RequireAuth";
import { CareFrame } from "@/components/care/CareFrame";

export default async function CareLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth>
      <CareFrame machineId={id}>{children}</CareFrame>
    </RequireAuth>
  );
}
