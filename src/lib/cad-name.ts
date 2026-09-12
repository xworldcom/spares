/** SolidWorks / ETO node names → a key we can join on without renaming CAD. */

export const IGNORED_CAD_NODE_NAMES = new Set([
  "",
  "Scene",
  "SceneRoot",
  "RootNode",
  "AuxScene",
  "Root",
]);

export function isIgnoredCadNodeName(name: string | undefined) {
  const trimmed = name?.trim() ?? "";
  return trimmed === "" || IGNORED_CAD_NODE_NAMES.has(trimmed);
}

/** Same rules as `SanitizeMeshName` in `public/export/spares-pack.bas`. */
export function sanitizePackMeshName(value: string) {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9._-]/.test(ch)) {
      out += ch;
    } else if (ch === " " || ch === "/" || ch === "\\" || ch === ":") {
      if (out.length > 0 && !out.endsWith("-")) {
        out += "-";
      }
    }
  }
  return out.replace(/--/g, "-").trim();
}

export function cleanCadName(name: string) {
  return name
    .trim()
    .replace(/^.*[\\/]/, "")
    .replace(/\.(sldprt|sldasm|prt|asm|step|stp|glb|gltf)$/i, "")
    .replace(/\^.*$/, "")
    .trim();
}

export function stripCadInstance(name: string) {
  return cleanCadName(name)
    .replace(/<\d+>\s*$/i, "")
    .replace(/\(\d+\)\s*$/, "")
    .replace(/[-_ ]\d{1,3}$/, "")
    .trim();
}

export function cadKeys(name: string | undefined): string[] {
  if (!name?.trim()) {
    return [];
  }
  const cleaned = cleanCadName(name);
  const stripped = stripCadInstance(name);
  const keys = [cleaned.toLowerCase()];
  if (stripped && stripped.toLowerCase() !== keys[0]) {
    keys.push(stripped.toLowerCase());
  }
  const sanitized = sanitizePackMeshName(cleaned);
  if (sanitized && sanitized.toLowerCase() !== keys[0]) {
    keys.push(sanitized.toLowerCase());
  }
  return keys;
}

export function cadKey(name: string | undefined) {
  return cadKeys(name)[0] ?? "";
}
