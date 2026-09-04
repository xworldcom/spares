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
    <div className="login-page mx-auto flex min-h-[calc(100dvh-var(--spares-header)-3rem)] max-w-md flex-col justify-center">
      <p className="spares-muted text-[11px] font-medium tracking-[0.16em] uppercase">
        Private
      </p>
      <h1 className="mt-2 text-[32px] font-semibold tracking-tight">Sign in</h1>
      <p className="spares-muted mt-2 text-[15px] leading-relaxed">
        Staff and customers use this screen. Cookie session. No public signup.
      </p>
      <div className="mt-8">
        <LoginForm nextPath={nextPath} />
      </div>
    </div>
  );
}
