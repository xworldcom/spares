import { createModelDownloadUrl, selectModelStoreKind } from "./model-storage.ts";
import { modelPublicUrl } from "./model-url.ts";
import { modelDownloadUrlTtlSeconds } from "./s3-config.ts";
import type { StoredMachine } from "./store.ts";

export async function machineFileUrl(
  request: Request,
  machine: Pick<StoredMachine, "id" | "storedFileName">,
) {
  const publicUrl = modelPublicUrl(machine.storedFileName);
  if (publicUrl) {
    return publicUrl;
  }
  if (selectModelStoreKind() === "s3") {
    const { downloadUrl } = await createModelDownloadUrl(
      machine.storedFileName,
      modelDownloadUrlTtlSeconds(),
    );
    return downloadUrl;
  }
  return new URL(`/api/machines/${machine.id}/file`, request.url).toString();
}
