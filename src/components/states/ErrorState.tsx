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
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-red-950"
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-red-800">{message}</p>
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
