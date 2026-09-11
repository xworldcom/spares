export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="spares-alert rounded-lg px-4 py-5"
    >
      <p className="spares-alert-title text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[#f0c4c0]">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="btn-danger mt-3 rounded-full px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
