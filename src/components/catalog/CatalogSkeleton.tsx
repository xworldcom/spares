export function CatalogSkeleton({
  variant,
  count = 4,
}: {
  variant: "machine" | "person";
  count?: number;
}) {
  return (
    <div
      className={variant === "machine" ? "catalog-machine-grid" : "catalog-people-list"}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className={`catalog-skeleton catalog-skeleton-${variant}`} />
      ))}
    </div>
  );
}
