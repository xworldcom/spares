"use client";

import { use } from "react";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const cache = new Map<string, Promise<GLTF>>();

let dracoLoader: DRACOLoader | null = null;

function getDracoLoader() {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(
      "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
    );
  }
  return dracoLoader;
}

function resourcePath(src: string): string {
  const cut = src.search(/[?#]/);
  const path = cut === -1 ? src : src.slice(0, cut);
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash + 1) : "";
}

function isSameOrigin(src: string) {
  if (src.startsWith("/")) {
    return true;
  }
  if (typeof window === "undefined") {
    return false;
  }
  try {
    return new URL(src, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

function createLoader(src: string) {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(getDracoLoader());
  loader.setMeshoptDecoder(MeshoptDecoder);
  if (isSameOrigin(src)) {
    loader.setWithCredentials(true);
  }
  return loader;
}

export function loadGltfWithCredentials(src: string): Promise<GLTF> {
  const existing = cache.get(src);
  if (existing) {
    return existing;
  }

  const promise = fetch(src, {
    credentials: isSameOrigin(src) ? "include" : "omit",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load model (${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      const loader = createLoader(src);
      return loader.parseAsync(buffer, resourcePath(src));
    })
    .catch((error: unknown) => {
      cache.delete(src);
      throw error instanceof Error
        ? error
        : new Error("The 3D model could not be parsed.");
    });

  cache.set(src, promise);
  return promise;
}

export function useCredentialedGLTF(src: string): GLTF {
  return use(loadGltfWithCredentials(src));
}
