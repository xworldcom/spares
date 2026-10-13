/** Camera refit key: visibility/isolation only — not part highlight selection. */
export function viewerAssemblyCameraKey(
  hiddenIds: readonly string[],
  isolatedId: string | null,
): string {
  return [hiddenIds.join("\0"), isolatedId ?? ""].join("|");
}
