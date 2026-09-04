export type PartSheetAutoDismiss = "hide" | "isolate" | "add";

export function partSheetVisible(selectedId: string | null | undefined) {
  return selectedId != null && selectedId !== "";
}

export function shouldAutoDismissPartSheet(action: PartSheetAutoDismiss) {
  return action === "hide" || action === "isolate" || action === "add";
}
