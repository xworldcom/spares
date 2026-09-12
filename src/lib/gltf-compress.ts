import { NodeIO } from "@gltf-transform/core";
import { KHRDracoMeshCompression, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { draco, meshopt, quantize } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import { formatMegabytes } from "./pack-limits.ts";
import { isGlb, normalizeGlb } from "./gltf.ts";

/** Models above this size must compress successfully before storage. */
export const LARGE_UNCOMPRESSED_BYTES = 15 * 1024 * 1024;

/** Compressed output must be at least this fraction smaller to count as success. */
export const MIN_COMPRESSION_RATIO = 0.85;

export type CompressResult = {
  bytes: Buffer;
  compressed: boolean;
  originalSize: number;
  finalSize: number;
};

let ioPromise: Promise<NodeIO> | null = null;

async function getIo() {
  if (!ioPromise) {
    ioPromise = (async () => {
      const io = new NodeIO()
        .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression])
        .registerDependencies({
          "draco3d.decoder": await draco3d.createDecoderModule(),
          "draco3d.encoder": await draco3d.createEncoderModule(),
          "meshopt.decoder": MeshoptDecoder,
          "meshopt.encoder": MeshoptEncoder,
        });
      return io;
    })();
  }
  return ioPromise;
}

/**
 * Normalize and compress a GLB with meshopt + Draco. Non-GLB input is returned
 * unchanged. Mesh and node names are preserved (no prune).
 */
export async function compressModelGlb(bytes: Buffer): Promise<CompressResult> {
  const originalSize = bytes.length;
  const normalized = normalizeGlb(bytes);
  if (!isGlb(normalized)) {
    return {
      bytes: normalized,
      compressed: false,
      originalSize,
      finalSize: normalized.length,
    };
  }

  try {
    const io = await getIo();
    const document = await io.readBinary(normalized);
    await document.transform(
      quantize(),
      meshopt({ encoder: MeshoptEncoder, level: "medium" }),
      draco(),
    );
    const compressed = Buffer.from(await io.writeBinary(document));
    const succeeded =
      compressed.length < normalized.length * MIN_COMPRESSION_RATIO;
    return {
      bytes: compressed,
      compressed: succeeded,
      originalSize,
      finalSize: compressed.length,
    };
  } catch (error) {
    console.warn(
      "[spares] GLB compression skipped:",
      error instanceof Error ? error.message : error,
    );
    return {
      bytes: normalized,
      compressed: false,
      originalSize,
      finalSize: normalized.length,
    };
  }
}

export function largeModelCompressionMessage(originalBytes: number) {
  const mb = formatMegabytes(originalBytes);
  return `This model is ${mb} MB and could not be compressed enough for storage. Re-export with Draco or meshopt compression in your CAD tool, or simplify the assembly before uploading.`;
}

export function validateLargeModelCompression(
  originalBytes: number,
  result: CompressResult,
): { ok: true } | { ok: false; message: string } {
  if (originalBytes <= LARGE_UNCOMPRESSED_BYTES) {
    return { ok: true };
  }
  if (result.compressed) {
    return { ok: true };
  }
  return { ok: false, message: largeModelCompressionMessage(originalBytes) };
}
