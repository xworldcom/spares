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
    const y = parseFloat(getComputedStyle(card).getPropertyValue("--sheet-clip-top")) || 0;
    const clipBottom = parseFloat(getComputedStyle(card).getPropertyValue("--sheet-clip-bottom")) || 0;
    const handle = card.querySelector(".snap-sheet-handle");
    const toolbar = card.querySelector(".conversation-sheet-toolbar");
    const handleBox = handle?.getBoundingClientRect();
    const toolbarBox = toolbar?.getBoundingClientRect();
    const visTop = cardBox.top + y;
    const visBottom = cardBox.bottom - clipBottom;
    return {
      snap: card.getAttribute("data-snap"),
      sheetY: Math.round(y),
      clipBottom: Math.round(clipBottom),
      visibleH: Math.round(cardBox.height - y - clipBottom),
      handleVisible: !!(
        handleBox &&
        handleBox.top >= visTop - 2 &&
        handleBox.bottom <= visBottom + 2
      ),
      notesHeaderVisible: !!(
        toolbarBox &&
        toolbarBox.top >= visTop - 2 &&
        toolbarBox.bottom <= visBottom + 2
      ),
      tabTop: tabBox ? Math.round(tabBox.top) : null,
      composerTop: compBox ? Math.round(compBox.top) : null,
      composerBottom: compBox ? Math.round(compBox.bottom) : null,
      composerAboveTabs: !!(tabBox && compBox && compBox.bottom <= tabBox.top - 4),
      tabVisible: tabBox ? tabBox.height > 0 && tabBox.top < innerHeight : null,
      zSheet: getComputedStyle(card).zIndex,
      zTab: tab ? getComputedStyle(tab).zIndex : null,
    };
  });
}

console.log("peek", await geom());
await page.locator(".snap-sheet-handle").first().click({ force: true });
await page.waitForTimeout(700);
const reply = await geom();
console.log("reply", reply);
await browser.close();
if (reply.snap !== "reply" && reply.snap !== "full") {
  console.error("FAIL did not reach reply snap", reply.snap);
  process.exit(1);
}
if (
  reply.visibleH < 200 ||
  !reply.composerAboveTabs ||
  !reply.tabVisible ||
  !reply.handleVisible ||
  !reply.notesHeaderVisible
) {
  console.error("FAIL intermediate seating", reply);
  process.exit(1);
}
console.log("PASS");
