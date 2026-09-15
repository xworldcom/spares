import { LandingPageGate } from "@/components/landing/LandingPageGate";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/machines";

  return <LandingPageGate nextPath={nextPath} />;
}
