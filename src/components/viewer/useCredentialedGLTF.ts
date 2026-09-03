"use client";

import { use } from "react";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

const cache = new Map<string, Promise<GLTF>>();

function resourcePath(src: string): string {
  const cut = src.search(/[?#]/);
  const path = cut === -1 ? src : src.slice(0, cut);
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(0, slash + 1) : "";
}

export function loadGltfWithCredentials(src: string): Promise<GLTF> {
  const existing = cache.get(src);
  if (existing) {
    return existing;
  }

  const promise = fetch(src, { credentials: "include" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load model (${response.status})`);
      }
      const buffer = await response.arrayBuffer();
      const loader = new GLTFLoader();
      loader.setWithCredentials(true);
      return loader.parseAsync(buffer, resourcePath(src));
    })
    .catch((error: unknown) => {
      cache.delete(src);
      throw error;
    });

  cache.set(src, promise);
  return promise;
}

export function useCredentialedGLTF(src: string): GLTF {
  return use(loadGltfWithCredentials(src));
}
