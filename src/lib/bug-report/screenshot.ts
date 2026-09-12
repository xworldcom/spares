const MAX_BYTES = Math.floor(1.5 * 1024 * 1024);

type R3FLike = {
  getState?: () => R3FLike;
  gl?: { render: (scene: unknown, camera: unknown) => void };
  scene?: unknown;
  camera?: unknown;
};

type CanvasSnapshot = {
  image: HTMLImageElement;
  x: number;
  y: number;
  width: number;
  height: number;
};

function isBugReportNode(node: Element) {
  return node.hasAttribute("data-bug-report") || Boolean(node.closest("[data-bug-report]"));
}

function presentWebGL(canvas: HTMLCanvasElement) {
  const root = (canvas as HTMLCanvasElement & { __r3f?: R3FLike }).__r3f;
  if (!root) {
    return;
  }
  const state = typeof root.getState === "function" ? root.getState() : root;
  if (state?.gl && state.scene && state.camera) {
    try {
      state.gl.render(state.scene, state.camera);
    } catch {
      // The page screenshot can still proceed without a forced present.
    }
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not read canvas snapshot"));
    image.src = url;
  });
}

async function snapshotCanvases() {
  const snapshots: CanvasSnapshot[] = [];

  for (const canvas of document.querySelectorAll("canvas")) {
    if (!(canvas instanceof HTMLCanvasElement) || isBugReportNode(canvas)) {
      continue;
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      continue;
    }
    try {
      presentWebGL(canvas);
      const url = canvas.toDataURL("image/png");
      if (!url || url === "data:," || url.length < 32) {
        continue;
      }
      snapshots.push({
        image: await loadImage(url),
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      });
    } catch {
      // Cross-origin or lost WebGL context — skip this canvas.
    }
  }
  return snapshots;
}

function estimateBase64Bytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.ceil((base64.length * 3) / 4);
}

function stripDataUrl(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

export function canvasToJpegBase64(
  canvas: HTMLCanvasElement,
  maxBytes = MAX_BYTES,
) {
  let quality = 0.82;
  let url = canvas.toDataURL("image/jpeg", quality);
  while (estimateBase64Bytes(url) > maxBytes && quality > 0.42) {
    quality -= 0.12;
    url = canvas.toDataURL("image/jpeg", quality);
  }

  let work: HTMLCanvasElement = canvas;
  let width = canvas.width;
  let height = canvas.height;
  while (estimateBase64Bytes(url) > maxBytes && width > 640) {
    width = Math.round(width * 0.75);
    height = Math.round(height * 0.75);
    const next = document.createElement("canvas");
    next.width = width;
    next.height = height;
    next.getContext("2d")?.drawImage(work, 0, 0, width, height);
    work = next;
    url = work.toDataURL("image/jpeg", 0.7);
  }
  return stripDataUrl(url);
}

function paintSnapshots(
  shot: HTMLCanvasElement,
  snapshots: CanvasSnapshot[],
  sourceWidth: number,
  sourceHeight: number,
) {
  const ctx = shot.getContext("2d");
  if (!ctx) {
    return;
  }
  const scaleX = shot.width / Math.max(sourceWidth, 1);
  const scaleY = shot.height / Math.max(sourceHeight, 1);
  for (const snap of snapshots) {
    ctx.drawImage(
      snap.image,
      snap.x * scaleX,
      snap.y * scaleY,
      snap.width * scaleX,
      snap.height * scaleY,
    );
  }
}

function isMostlyBlank(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx || canvas.width < 2 || canvas.height < 2) {
    return true;
  }
  const sampleW = Math.min(canvas.width, 96);
  const sampleH = Math.min(canvas.height, 96);
  const pixels = ctx.getImageData(0, 0, sampleW, sampleH).data;
  let ink = 0;
  for (let i = 0; i < pixels.length; i += 16) {
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const alpha = pixels[i + 3];
    if (alpha > 12 && (red < 246 || green < 246 || blue < 246)) {
      ink += 1;
    }
  }
  return ink < 6;
}

function fallbackViewportShot(snapshots: CanvasSnapshot[]) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(window.innerWidth));
  canvas.height = Math.max(1, Math.round(window.innerHeight));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return canvas;
  }
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const snap of snapshots) {
    ctx.drawImage(
      snap.image,
      snap.x - window.scrollX,
      snap.y - window.scrollY,
      snap.width,
      snap.height,
    );
  }
  return canvas;
}

function ignoreCloneNode(node: Node) {
  if (!(node instanceof Element)) {
    return true;
  }
  return !isBugReportNode(node) && node.tagName !== "NEXTJS-PORTAL";
}

async function captureDomWithHtmlToImage() {
  const { toCanvas } = await import("html-to-image");
  const width = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, 1);
  const height = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    1,
  );
  return toCanvas(document.body, {
    backgroundColor: "#fafafa",
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
    cacheBust: true,
    width,
    height,
    filter: ignoreCloneNode,
  });
}

async function captureDomWithHtml2Canvas(foreignObjectRendering: boolean) {
  const html2canvas = (await import("html2canvas")).default;
  return html2canvas(document.body, {
    backgroundColor: "#fafafa",
    useCORS: true,
    logging: false,
    foreignObjectRendering,
    scale: Math.min(window.devicePixelRatio || 1, 1.5),
    ignoreElements: (element) =>
      element instanceof Element &&
      (isBugReportNode(element) || element.tagName === "NEXTJS-PORTAL"),
    onclone: (cloned) => {
      cloned.querySelectorAll("[data-bug-report]").forEach((node) => node.remove());
    },
  });
}

export async function waitTwoAnimationFrames() {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export async function capturePageJpegBase64() {
  const snapshots = await snapshotCanvases();
  const sourceWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body.scrollWidth,
    1,
  );
  const sourceHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
    1,
  );

  const attempts = [
    captureDomWithHtmlToImage,
    () => captureDomWithHtml2Canvas(true),
    () => captureDomWithHtml2Canvas(false),
  ];

  for (const attempt of attempts) {
    try {
      const shot = await attempt();
      paintSnapshots(shot, snapshots, sourceWidth, sourceHeight);
      if (!isMostlyBlank(shot) || snapshots.length > 0) {
        return canvasToJpegBase64(shot);
      }
    } catch {
      // Try the next capture strategy.
    }
  }

  return canvasToJpegBase64(fallbackViewportShot(snapshots));
}
