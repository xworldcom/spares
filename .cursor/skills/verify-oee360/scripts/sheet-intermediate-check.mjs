import { chromium, devices } from "playwright";

const baseUrl = process.argv[2] || "http://127.0.0.1:3010";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  ...devices["iPhone 13"],
  viewport: { width: 390, height: 700 },
});
const page = await context.newPage();
const login = await page.request.post(`${baseUrl}/api/auth/login`, {
  data: { email: "staff@spares.local", password: "SparesStaff1!" },
});
if (!login.ok()) {
  console.error("login", login.status(), await login.text());
  process.exit(1);
}
await page.request.post(`${baseUrl}/api/staff/quotes/preview-fixture`);
const quoteId = "quote-preview-qa-conversation";
for (let n = 1; n <= 3; n += 1) {
  await page.request.post(`${baseUrl}/api/quotes/${quoteId}/activity`, {
    data: { text: `Line ${n} for intermediate check.` },
  });
}
await page.goto(`${baseUrl}/staff/quotes/${quoteId}?sheetDebug=1`);
await page.locator("[data-conversation-sheet]").waitFor();
await page.waitForTimeout(400);

async function geom() {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const tab = document.querySelector(".spares-tabbar");
    const composer = card?.querySelector(".imsg-composer");
    const tabBox = tab?.getBoundingClientRect();
    const compBox = composer?.getBoundingClientRect();
    const cardBox = card.getBoundingClientRect();
    const handle = card.querySelector(".snap-sheet-handle");
    const toolbar = card.querySelector(".conversation-sheet-toolbar");
    const handleBox = handle?.getBoundingClientRect();
    const toolbarBox = toolbar?.getBoundingClientRect();
    return {
      snap: card.getAttribute("data-snap"),
      sheetH: Math.round(cardBox.height),
      handleVisible: !!(handleBox && handleBox.height > 0),
      notesHeaderVisible: !!(toolbarBox && toolbarBox.height > 0),
      tabTop: tabBox ? Math.round(tabBox.top) : null,
      composerTop: compBox ? Math.round(compBox.top) : null,
      composerBottom: compBox ? Math.round(compBox.bottom) : null,
      composerAboveTabs: !!(tabBox && compBox && compBox.bottom <= tabBox.top + 2),
      tabVisible: tabBox ? tabBox.height > 0 && tabBox.top < innerHeight : null,
      zSheet: getComputedStyle(card).zIndex,
      zTab: tab ? getComputedStyle(tab).zIndex : null,
    };
  });
}

const rest = await geom();
console.log("rest", rest);
if (rest.snap !== "reply" && rest.snap !== "peek") {
  console.error("FAIL resting snap should be intermediate (reply)", rest.snap);
  process.exit(1);
}
if (
  rest.sheetH < 200 ||
  !rest.composerAboveTabs ||
  !rest.tabVisible ||
  !rest.handleVisible ||
  !rest.notesHeaderVisible
) {
  console.error("FAIL intermediate seating", rest);
  process.exit(1);
}
await page.locator(".snap-sheet-handle").first().click({ force: true });
await page.waitForTimeout(700);
const open = await geom();
console.log("open", open);
await browser.close();
if (open.snap !== "full") {
  console.error("FAIL handle should open to full", open.snap);
  process.exit(1);
}
console.log("PASS");
