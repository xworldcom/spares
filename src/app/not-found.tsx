import Link from "next/link";

export default function NotFound() {
  return (
    <main className="spares-app flex min-h-dvh flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#e8c27a]">
        OEE360
      </p>
      <h1 className="mt-3 text-[28px] font-semibold tracking-tight">Page not found</h1>
      <p className="spares-muted mt-2 max-w-md text-[15px] leading-relaxed">
        That link may be outdated or you may not have access. Head back to your machines or sign
        in again.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/machines" className="btn-primary inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold">
          Open machines
        </Link>
        <Link href="/" className="btn-soft inline-flex h-11 items-center rounded-full px-5 text-sm font-medium">
          Home
        </Link>
      </div>
    </main>
  );
}
