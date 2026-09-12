"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="spares-alert rounded-lg px-4 py-5">
      <h1 className="spares-alert-title text-sm font-semibold">Something went wrong</h1>
      <p className="mt-1 text-sm text-[#f0c4c0]">
        {error.message || "An unexpected error occurred."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="btn-danger mt-3 rounded-full px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </div>
  );
}
