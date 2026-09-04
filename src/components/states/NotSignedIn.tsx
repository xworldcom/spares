import Link from "next/link";
import { usePathname } from "next/navigation";

export function NotSignedIn() {
  const pathname = usePathname();
  const href =
    pathname && pathname !== "/login"
      ? `/login?next=${encodeURIComponent(pathname)}`
      : "/login";

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-amber-950">
      <p className="text-sm font-semibold">Not signed in</p>
      <p className="mt-1 text-sm text-amber-900">
        Sign in with a staff or customer account to continue. There is no public
        signup.
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
