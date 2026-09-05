/** SolidWorks / ETO node names → a key we can join on without renaming CAD. */

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
  return keys;
}

export function cadKey(name: string | undefined) {
  return cadKeys(name)[0] ?? "";
}
