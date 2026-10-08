export function MachineWorkspaceSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-5xl space-y-4 px-1 py-2"
      aria-busy="true"
      aria-label="Loading machine"
    >
      <div className="catalog-skeleton h-8 w-56 rounded-2xl" />
      <div className="catalog-skeleton h-[min(58dvh,30rem)] w-full rounded-[28px]" />
      <div className="flex gap-3">
        <div className="catalog-skeleton h-11 w-32 rounded-full" />
        <div className="catalog-skeleton h-11 flex-1 rounded-full" />
      </div>
    </div>
  );
}
