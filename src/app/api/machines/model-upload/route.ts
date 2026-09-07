import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { requireRole } from "@/lib/auth";
import { json, error } from "@/lib/http";
import {
  CLIENT_PACK_MAX_BYTES,
  packOverLimitMessage,
  storedFileNameFromUploadPath,
} from "@/lib/pack-limits";
import { isModelFilename } from "@/lib/machines";

export const maxDuration = 60;

function clientUploadAvailable() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function GET() {
  const auth = await requireRole("staff");
  if ("error" in auth) {
    return auth.error;
  }
  return json({
    clientUpload: clientUploadAvailable(),
    maxBytes: CLIENT_PACK_MAX_BYTES,
  });
}

export async function POST(request: Request) {
  if (!clientUploadAvailable()) {
    return error(
      "Blob storage is not attached on this preview, so large models cannot go straight to storage.",
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

        return {
          allowedContentTypes: [
            "model/gltf-binary",
            "model/gltf+json",
            "application/octet-stream",
            "application/json",
          ],
          addRandomSuffix: false,
          allowOverwrite: false,
          maximumSizeInBytes: CLIENT_PACK_MAX_BYTES,
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
