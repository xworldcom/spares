export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="spares-muted text-sm" aria-live="polite">
      {label}
    </p>
  );
}
