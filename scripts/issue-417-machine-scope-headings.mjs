#!/usr/bin/env node
/**
 * Issue #417: machine-scoped quotes/tickets show machine name + back to all list.
 *
 *   node scripts/issue-417-machine-scope-headings.mjs
 *   OEE360_BASE_URL=https://oee360.com node scripts/issue-417-machine-scope-headings.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.OEE360_BASE_URL || "http://127.0.0.1:3010";
const outDir = resolve(
  process.env.OEE360_EVIDENCE_DIR || "/opt/cursor/artifacts/evidence/issue-417",
);
mkdirSync(outDir, { recursive: true });

const MACHINE = "hardware-fixture";
const MACHINE_NAME = "Hardware fixture";

async function signInCustomer(page) {
  if (baseUrl.includes("127.0.0.1") || baseUrl.includes("localhost")) {
    const login = await page.context().request.post(`${baseUrl}/api/auth/login`, {
      data: { email: "customer@spares.local", password: "SparesCustomer1!" },
    });
    if (!login.ok()) {
      throw new Error(`local login failed: ${login.status()}`);
    }
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Email").fill("user@demo.com");
  await page.getByLabel("Password").fill("demo123456");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/(machines|quotes)/, { timeout: 60_000 });
}

async function assertScope(page, { path, noun, screenshot }) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const back = page.locator(".work-list-scope-back");
  await back.waitFor({ timeout: 30_000 });
  const backText = (await back.textContent())?.replace(/\s+/g, " ").trim() ?? "";
  const scopedHeading = page.locator(".work-list-scope h1, .work-list-scope h2");
  const headingText = (await scopedHeading.first().textContent())?.trim() ?? "";
  const expectedHeading = `${MACHINE_NAME} · ${noun}`;
  const expectedBack = `← All ${noun.toLowerCase()}`;
  const ok =
    headingText === expectedHeading &&
    backText.toLowerCase() === expectedBack.toLowerCase();
  if (screenshot) {
    await page.screenshot({ path: `${outDir}/${screenshot}`, fullPage: true });
  }
  return { path, ok, headingText, backText, expectedHeading, expectedBack };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await signInCustomer(page);

  const quotes = await assertScope(page, {
    path: `/machines/${MACHINE}/quotes`,
    noun: "Quotes",
    screenshot: "desktop-machine-quotes.png",
  });
  const tickets = await assertScope(page, {
    path: `/machines/${MACHINE}/care/tickets`,
    noun: "Tickets",
    screenshot: "desktop-machine-tickets.png",
  });

  await browser.close();

  const report = {
    baseUrl,
    at: new Date().toISOString(),
    ok: quotes.ok && tickets.ok,
    quotes,
    tickets,
  };
  writeFileSync(`${outDir}/probe-results.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
