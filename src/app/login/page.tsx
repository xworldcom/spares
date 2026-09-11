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
    <div className="login-page mx-auto flex min-h-[calc(100dvh-var(--spares-header))] max-w-md flex-col justify-center px-1 pb-16">
      <p className="login-kicker text-[11px] font-medium tracking-[0.22em] uppercase">
        Private
      </p>
      <h1 className="mt-5 text-[40px] leading-[1.05] font-semibold tracking-tight">
        Sign in
      </h1>
      <p className="spares-muted mt-4 max-w-sm text-[16px] leading-relaxed">
        Staff and plant accounts. Cookie session. No public signup.
      </p>
      <div className="mt-10">
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  );
}
