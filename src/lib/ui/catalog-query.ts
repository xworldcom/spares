export function catalogQueryMatch(
  query: string,
  fields: Array<string | undefined | null>,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return fields.some((field) => (field ?? "").toLowerCase().includes(needle));
}
