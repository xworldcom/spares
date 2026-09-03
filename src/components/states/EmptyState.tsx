export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-8 text-center">
      <p className="text-sm font-semibold text-neutral-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-neutral-600">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
