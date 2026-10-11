/** Bytes read from Vercel Blob `get` bodies during this serverless invocation (diagnostics). */
let blobReadBytes = 0;

export function resetBlobReadBytes() {
  blobReadBytes = 0;
}

export function addBlobReadBytes(bytes: number) {
  if (bytes > 0) {
    blobReadBytes += bytes;
  }
}

export function getBlobReadBytes() {
  return blobReadBytes;
}

export const BLOB_READ_BYTES_HEADER = "X-Spares-Blob-Read-Bytes";

export function blobReadBytesHeaders(): Record<string, string> {
  return { [BLOB_READ_BYTES_HEADER]: String(blobReadBytes) };
}
