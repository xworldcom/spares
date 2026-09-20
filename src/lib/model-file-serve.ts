import { modelContentType } from "./machines.ts";
import {
  createModelDownloadUrl,
  modelExistsInS3,
  modelProxyRefusedMessage,
  selectModelStoreKind,
} from "./model-storage.ts";
import { modelPublicUrl } from "./model-url.ts";
import {
  isVercelRuntime,
  vercelLargeModelProxyMessage,
} from "./model-upload-policy.ts";
import { MODEL_PROXY_MAX_BYTES } from "./pack-limits.ts";
import { modelDownloadUrlTtlSeconds } from "./s3-config.ts";
import { readStoredFile } from "./store.ts";

export type ModelFileServeResult =
  | { kind: "redirect"; url: string }
  | {
      kind: "stream";
      bytes: Buffer;
      contentType: string;
      originalFileName: string;
    }
  | { kind: "error"; message: string; status: number };

export async function resolveMachineFileServe(input: {
  storedFileName: string;
  originalFileName: string;
}): Promise<ModelFileServeResult> {
  if (selectModelStoreKind() === "s3") {
    if (await modelExistsInS3(input.storedFileName)) {
      const publicUrl = modelPublicUrl(input.storedFileName);
      if (publicUrl) {
        return { kind: "redirect", url: publicUrl };
      }
      const { downloadUrl } = await createModelDownloadUrl(
        input.storedFileName,
        modelDownloadUrlTtlSeconds(),
      );
      return { kind: "redirect", url: downloadUrl };
    }
  }

  try {
    const bytes = await readStoredFile(input.storedFileName);
    if (bytes.length > MODEL_PROXY_MAX_BYTES) {
      if (selectModelStoreKind() === "s3") {
        return {
          kind: "error",
          message: modelProxyRefusedMessage(bytes.length),
          status: 413,
        };
      }
      if (isVercelRuntime()) {
        return {
          kind: "error",
          message: vercelLargeModelProxyMessage(bytes.length),
          status: 413,
        };
      }
    }
    return {
      kind: "stream",
      bytes,
      contentType: modelContentType(input.originalFileName),
      originalFileName: input.originalFileName,
    };
  } catch {
    return { kind: "error", message: "Model file is missing", status: 404 };
  }
}
