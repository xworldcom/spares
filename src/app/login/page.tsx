import { LandingScreen } from "@/components/landing/LandingScreen";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/machines";

  return <LandingScreen nextPath={nextPath} />;
}
