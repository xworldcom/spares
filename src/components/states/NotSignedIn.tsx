import Link from "next/link";
import { usePathname } from "next/navigation";

export function NotSignedIn() {
  const pathname = usePathname();
  const href =
    pathname && pathname !== "/login"
      ? `/login?next=${encodeURIComponent(pathname)}`
      : "/login";

  return (
    <div className="rounded-lg border border-[#e8c27a]/25 bg-[#2a2214] px-4 py-5 text-[#f0d9a8]">
      <p className="text-sm font-semibold">Not signed in</p>
      <p className="mt-1 text-sm text-[#e8c27a]">
        Invite-only. Sign in to continue.
      </p>
      <Link
        href={href}
        className="btn-primary mt-3 inline-flex rounded-full px-4 py-2 text-sm font-medium"
      >
        Sign in
      </Link>
    </div>
  );
}
