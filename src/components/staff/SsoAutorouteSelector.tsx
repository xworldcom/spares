"use client";

export function SsoAutorouteSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="stack gap-1">
      <span className="text-sm font-medium" id="sso-autoroute-label">
        Autoroute
      </span>
      <div
        role="radiogroup"
        aria-labelledby="sso-autoroute-label"
        className="flex rounded-full bg-white/5 p-1 w-fit"
      >
        {(
          [
            { on: false, label: "Off" },
            { on: true, label: "On" },
          ] as const
        ).map((option) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={value === option.on}
            disabled={disabled}
            onClick={() => onChange(option.on)}
            className={
              value === option.on
                ? "rounded-full bg-white/10 px-4 py-1.5 text-sm font-semibold"
                : "rounded-full px-4 py-1.5 text-sm font-medium text-[var(--spares-muted)] hover:text-[var(--spares-ink)]"
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="spares-muted text-sm">
        On: unknown Microsoft work accounts at the enrolled domain join this host as
        staff. Off: keep the domain on file, but do not create logins.
      </p>
    </div>
  );
}
