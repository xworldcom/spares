import fs from "node:fs";
import path from "node:path";

const apiRoot = "src/app/api";

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === "route.ts") out.push(p);
  }
  return out;
}

// Manual list of files already patched or special
const skip = new Set(["src/app/api/platform/tenants/route.ts"]);

for (const file of walk(apiRoot)) {
  if (skip.has(file)) continue;
  let s = fs.readFileSync(file, "utf8");
  if (!s.includes("@/lib/store")) continue;
  if (s.includes("tenantIdForUser") || s.includes("requireTenantStaff")) continue;
  console.log("needs patch:", file);
}
