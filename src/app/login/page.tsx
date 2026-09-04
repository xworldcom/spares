import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/machines";

  return (
    <div className="login-page mx-auto max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="spares-muted mt-2 text-sm">
        Staff and customers use this screen. Cookie session. No public signup.
      </p>
      <div className="mt-6">
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  );
}
