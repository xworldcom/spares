import { initialsFromEmail } from "@/lib/ui/initials";

export function MachineGlyph() {
  return (
    <span className="catalog-glyph catalog-glyph-machine" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none">
        <path d="M24 7.5 41 16 24 24.5 7 16 24 7.5Z" fill="currentColor" opacity="0.92" />
        <path d="M7 16v16.5L24 41V24.5L7 16Z" fill="currentColor" opacity="0.38" />
        <path d="M24 24.5V41l17-8.5V16L24 24.5Z" fill="currentColor" opacity="0.62" />
      </svg>
    </span>
  );
}

export function PersonGlyph({ email }: { email: string }) {
  return (
    <span className="catalog-glyph catalog-glyph-person" aria-hidden="true">
      {initialsFromEmail(email)}
    </span>
  );
}
