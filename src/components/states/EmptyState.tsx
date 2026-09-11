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
    <div className="px-1 py-10">
      <p className="text-[22px] font-semibold tracking-tight">{title}</p>
      <p className="spares-muted mt-2 max-w-md text-[15px] leading-relaxed">{message}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
