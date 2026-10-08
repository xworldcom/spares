"use client";

export function QuoteUndoToast({
  label,
  onUndo,
  onDismiss,
}: {
  label: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="quote-undo-toast" role="status" aria-live="polite">
      <span className="quote-undo-toast-text">Removed · {label}</span>
      <button type="button" className="quote-undo-toast-action" onClick={onUndo}>
        Undo
      </button>
      <button
        type="button"
        className="quote-undo-toast-dismiss"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
