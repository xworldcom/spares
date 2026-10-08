"use client";

export function QuoteAddToast({
  message,
}: {
  message: string | null;
}) {
  if (!message) {
    return null;
  }
  return (
    <div
      className="quote-add-toast"
      role="status"
      aria-live="polite"
      data-quote-add-toast=""
    >
      <span className="quote-add-toast-text">Added · {message}</span>
    </div>
  );
}
