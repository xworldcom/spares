import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireRole } from "@/lib/auth";
import { json, error } from "@/lib/http";
import {
  blobUploadMaxBytes,
  isVercelRuntime,
} from "@/lib/model-upload-policy";
import {
  CLIENT_PACK_MAX_BYTES,
  packOverLimitMessage,
  storedFileNameFromUploadPath,
} from "@/lib/pack-limits";
import { isModelFilename, modelExtension } from "@/lib/machines";
import { createModelUploadUrl } from "@/lib/model-storage";
import { isS3Configured } from "@/lib/s3-config";
import { randomUUID } from "node:crypto";

export const maxDuration = 60;

function blobClientUploadAvailable() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && !isS3Configured();
}

export async function GET() {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }
  const availability = {
    clientUpload: blobClientUploadAvailable(),
    s3Upload: isS3Configured(),
    maxBytes: CLIENT_PACK_MAX_BYTES,
    vercelRuntime: isVercelRuntime(),
  };
  return json({
    ...availability,
    maxBytes: blobUploadMaxBytes(availability),
  });
}

export async function POST(request: Request) {
  if (isS3Configured()) {
    const auth = await requireRole("staff");
    if ("error" in auth) {
      return auth.error;
    }

    let body: { originalFileName?: string };
    try {
      body = (await request.json()) as { originalFileName?: string };
    } catch {
      return error("Expected JSON", 400);
    }

    const originalFileName =
      typeof body.originalFileName === "string" ? body.originalFileName.trim() : "";
    if (!originalFileName || !isModelFilename(originalFileName)) {
      return error("Model must be a .glb or .gltf file.", 400);
    }

    const storedFileName = `${randomUUID()}${modelExtension(originalFileName)}`;
    try {
      const { uploadUrl } = await createModelUploadUrl(storedFileName);
      return json({ uploadUrl, storedFileName, method: "PUT" });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Could not start the model upload.";
      return error(message, 400);
    }
  }

  if (!blobClientUploadAvailable()) {
    return error(
      "Object storage is not attached on this preview, so large models cannot go straight to storage.",
      503,
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return error("Expected JSON", 400);
  }

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const auth = await requireRole("staff");
        if ("error" in auth) {
          throw new Error("Staff sign-in is required to upload a machine pack.");
        }

        let storedFileName: string;
        try {
          storedFileName = storedFileNameFromUploadPath(pathname);
        } catch {
          throw new Error("Invalid model path.");
        }
        if (!isModelFilename(storedFileName)) {
          throw new Error("Model must be a .glb or .gltf file.");
        }

        const availability = {
          clientUpload: true,
          s3Upload: false,
          maxBytes: CLIENT_PACK_MAX_BYTES,
          vercelRuntime: isVercelRuntime(),
        };

        return {
          allowedContentTypes: [
            "model/gltf-binary",
            "model/gltf+json",
            "application/octet-stream",
            "application/json",
          ],
          addRandomSuffix: false,
          allowOverwrite: false,
          maximumSizeInBytes: blobUploadMaxBytes(availability),
          cacheControlMaxAge: 60,
          tokenPayload: JSON.stringify({
            storedFileName,
            userId: auth.user.id,
          }),
        };
      },
      onUploadCompleted: async () => {
        // Machine rows are created by the following staff POST, not this webhook.
      },
    });

    return json(jsonResponse);
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Could not start the model upload.";
    if (/maximum|too large|size/i.test(message)) {
      return error(packOverLimitMessage(CLIENT_PACK_MAX_BYTES + 1, CLIENT_PACK_MAX_BYTES), 413);
    }
    return error(message, 400);
  }
}
