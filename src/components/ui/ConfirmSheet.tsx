"use client";

export function ConfirmSheet({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="confirm-sheet-backdrop" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-sheet-title"
        aria-describedby="confirm-sheet-message"
        className="confirm-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="confirm-sheet-title" className="text-[17px] font-semibold tracking-tight">
          {title}
        </p>
        <p id="confirm-sheet-message" className="mt-2 text-sm leading-relaxed text-[var(--spares-muted)]">
          {message}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="btn-soft inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-semibold"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`${
              destructive ? "btn-danger" : "btn-primary"
            } inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-semibold disabled:opacity-60`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
