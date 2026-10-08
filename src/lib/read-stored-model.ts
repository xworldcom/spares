import { modelExistsInS3, readModelFile, selectModelStoreKind } from "./model-storage.ts";

const MAX_ATTEMPTS = 5;
const ATTEMPT_DELAY_MS = 150;

function isTransientReadFailure(error: unknown) {
  return error instanceof Error;
}

/**
 * Read a model blob after client-direct upload. S3 can briefly 404 right after PUT;
 * poll with bounded backoff instead of a one-off sleep+retry in the upload path.
 */
export async function readStoredModelAfterUpload(storedFileName: string) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const bytes = await readModelFile(storedFileName);
      if (bytes?.length) {
        return bytes;
      }
      if (selectModelStoreKind() === "s3") {
        const exists = await modelExistsInS3(storedFileName);
        if (!exists) {
          return null;
        }
      } else if (attempt === 0) {
        return null;
      }
    } catch (error) {
      if (!isTransientReadFailure(error) || attempt === MAX_ATTEMPTS - 1) {
        throw error;
      }
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, ATTEMPT_DELAY_MS));
    }
  }
  return null;
}
