export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="text-sm text-neutral-500" aria-live="polite">
      {label}
    </p>
  );
}
