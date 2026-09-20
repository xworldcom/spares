import {
  createManualDownloadUrl,
  manualExistsInS3,
  selectManualStoreKind,
} from "./manual-storage.ts";
import type { MachineManual } from "../types/index.ts";

export async function manualFileUrl(
  request: Request,
  machineId: string,
  manual: Pick<MachineManual, "id" | "storedFileName">,
) {
  const proxyUrl = new URL(
    `/api/machines/${machineId}/manuals/${manual.id}/file`,
    request.url,
  ).toString();

  if (selectManualStoreKind() === "s3") {
    const inS3 = await manualExistsInS3(manual.storedFileName);
    if (inS3) {
      const { downloadUrl } = await createManualDownloadUrl(manual.storedFileName);
      return downloadUrl;
    }
  }

  return proxyUrl;
}
