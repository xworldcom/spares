import {
  createModelDownloadUrl,
  modelExistsInS3,
  selectModelStoreKind,
} from "./model-storage.ts";
import { modelPublicUrl } from "./model-url.ts";
import { modelDownloadUrlTtlSeconds } from "./s3-config.ts";
import type { StoredMachine } from "./store.ts";

export async function machineFileUrl(
  request: Request,
  machine: Pick<StoredMachine, "id" | "storedFileName">,
) {
  const proxyUrl = new URL(
    `/api/machines/${machine.id}/file`,
    request.url,
  ).toString();

  if (selectModelStoreKind() === "s3") {
    const inS3 = await modelExistsInS3(machine.storedFileName);
    if (inS3) {
      const publicUrl = modelPublicUrl(machine.storedFileName);
      if (publicUrl) {
        return publicUrl;
      }
      const { downloadUrl } = await createModelDownloadUrl(
        machine.storedFileName,
        modelDownloadUrlTtlSeconds(),
      );
      return downloadUrl;
    }
    return proxyUrl;
  }

  const publicUrl = modelPublicUrl(machine.storedFileName);
  if (publicUrl) {
    return publicUrl;
  }
  return proxyUrl;
}
