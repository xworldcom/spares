"use client";

type Props = {
  message: string;
  onRefresh: () => void;
  onDismiss?: () => void;
};

export function RecordConflictBanner({ message, onRefresh, onDismiss }: Props) {
  return (
    <div
      className="record-conflict-banner flex flex-col gap-2 rounded-2xl border border-amber-400/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-50"
      data-record-conflict-banner=""
      role="status"
      aria-live="polite"
    >
      <p>{message}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-full bg-amber-400/90 px-3 py-1 text-xs font-semibold text-amber-950"
          onClick={() => onRefresh()}
        >
          Refresh
        </button>
        {onDismiss ? (
          <button
            type="button"
            className="rounded-full px-3 py-1 text-xs font-medium text-amber-100/90 underline-offset-2 hover:underline"
            onClick={() => onDismiss()}
          >
            Keep editing
          </button>
        ) : null}
      </div>
    </div>
  );
}
