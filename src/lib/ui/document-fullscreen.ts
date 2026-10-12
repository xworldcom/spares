type DocumentWithWebkit = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type ElementWithWebkit = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>;
};

export function documentFullscreenElement(): Element | null {
  if (typeof document === "undefined") {
    return null;
  }
  const doc = document as DocumentWithWebkit;
  return document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
}

export function exitDocumentFullscreen(): void {
  if (typeof document === "undefined") {
    return;
  }
  const doc = document as DocumentWithWebkit;
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => undefined);
    return;
  }
  if (doc.webkitFullscreenElement) {
    void Promise.resolve(doc.webkitExitFullscreen?.()).catch(() => undefined);
  }
}

export function requestElementFullscreen(node: HTMLElement): Promise<void> {
  const el = node as ElementWithWebkit;
  if (node.requestFullscreen) {
    return node.requestFullscreen();
  }
  if (el.webkitRequestFullscreen) {
    return el.webkitRequestFullscreen();
  }
  return Promise.reject(new Error("fullscreen unavailable"));
}

export function addFullscreenChangeListener(listener: () => void): () => void {
  document.addEventListener("fullscreenchange", listener);
  document.addEventListener("webkitfullscreenchange", listener);
  return () => {
    document.removeEventListener("fullscreenchange", listener);
    document.removeEventListener("webkitfullscreenchange", listener);
  };
}
