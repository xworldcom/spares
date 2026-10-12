#!/usr/bin/env node
/**
 * Issue #415 — signed-in chrome shows account initials bubble (not bare Sign out).
 * Run: node .cursor/skills/verify-oee360/scripts/issue-415-account-chrome-prod.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "https://oee360.com";
const ticketPath =
  process.env.OEE360_ISSUE_415_TICKET_PATH ||
  "/care/tickets/c9e1dc16-28c6-472c-a7b4-1f461bc36ed0";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR ||
    join(
      resolve(import.meta.dirname, ".."),
      "evidence",
      process.env.OEE360_VERIFY_RUN_ID || "issue-415",
    ),
);
mkdirSync(outDir, { recursive: true });

const proof = { baseUrl, ticketPath, checks: [], ok: true };
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const login = await ctx.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "user@demo.com", password: "demo123456" },
});
if (!login.ok()) {
  proof.ok = false;
  proof.checks.push({ id: "login", pass: false, status: login.status() });
  writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
  console.log(JSON.stringify(proof, null, 2));
  process.exit(1);
}

const page = await ctx.newPage();
await page.goto(`${baseUrl}${ticketPath}`, {
  waitUntil: "networkidle",
  timeout: 120_000,
});

const bareSignOut = await page.getByRole("button", { name: /^Sign out$/i }).count();
const accountMenu = await page.getByRole("button", { name: /Account menu/i });
const hasAccountMenu = (await accountMenu.count()) === 1;
const initials = hasAccountMenu ? (await accountMenu.innerText()).trim() : "";
proof.checks.push({
  id: "header-chrome",
  pass: bareSignOut === 0 && hasAccountMenu && initials.length >= 2,
  bareSignOut,
  hasAccountMenu,
  initials,
});
if (!proof.checks.at(-1).pass) {
  proof.ok = false;
}

await page.screenshot({ path: join(outDir, "issue-415-header.png") });

if (hasAccountMenu) {
  await accountMenu.click();
  await page.waitForTimeout(200);
  const menuSignOut = await page.getByRole("menuitem", { name: /^Sign out$/i }).count();
  proof.checks.push({ id: "account-menu-sign-out", pass: menuSignOut === 1, menuSignOut });
  if (!proof.checks.at(-1).pass) {
    proof.ok = false;
  }
  await page.screenshot({ path: join(outDir, "issue-415-account-menu-open.png") });
}

await browser.close();
writeFileSync(join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
console.log(JSON.stringify(proof, null, 2));
process.exit(proof.ok ? 0 : 1);
