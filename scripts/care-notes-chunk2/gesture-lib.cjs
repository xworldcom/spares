/** CDP touch drags — no scrollTo or JS snap pokes. */
async function cdpTouchDrag(page, fromX, fromY, toX, toY, steps = 36, pauseMs = 28) {
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: fromX, y: fromY }],
  });
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y }],
    });
    if (pauseMs > 0) {
      await page.waitForTimeout(pauseMs);
    }
  }
  await client.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}

async function waitSheetSettled(page) {
  await page.waitForFunction(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    return card && !card.classList.contains("is-settling") && !card.classList.contains("is-dragging");
  }, { timeout: 8000 });
  await page.waitForTimeout(120);
}

async function readSheetGeom(page) {
  return page.evaluate(() => {
    const card = document.querySelector("[data-conversation-sheet]");
    const thread = card?.querySelector(".imsg-thread");
    const composer = card?.querySelector(".imsg-composer");
    const tabBar = document.querySelector(".spares-tabbar, nav.spares-tabs, [data-tabbar]");
    const rows = [...(thread?.querySelectorAll(":scope > li") ?? [])];
    const last = rows.at(-1);
    const cardBox = card?.getBoundingClientRect();
    const composerBox = composer?.getBoundingClientRect();
    const lastBox = last?.getBoundingClientRect();
    const tabTop = tabBar?.getBoundingClientRect().top ?? null;
    const phaseA = Number(getComputedStyle(card).getPropertyValue("--phase-a")) || 0;
    const phaseB = Number(getComputedStyle(card).getPropertyValue("--phase-b")) || 0;
    const composerBelowTab =
      composerBox && tabTop != null ? composerBox.top >= tabTop - 2 : null;
    return {
      snap: card?.getAttribute("data-snap"),
      phaseA: Math.round(phaseA * 100) / 100,
      phaseB: Math.round(phaseB * 100) / 100,
      sheetH: cardBox ? Math.round(cardBox.height) : null,
      sheetBottom: cardBox ? Math.round(cardBox.bottom) : null,
      tabTop: tabTop != null ? Math.round(tabTop) : null,
      composerTop: composerBox ? Math.round(composerBox.top) : null,
      composerBottom: composerBox ? Math.round(composerBox.bottom) : null,
      composerBelowTab,
      gap: lastBox && composerBox ? Math.round(composerBox.top - lastBox.bottom) : null,
      openH: Math.round(Number.parseFloat(getComputedStyle(card).getPropertyValue("--full-h")) || 0),
    };
  });
}

module.exports = { cdpTouchDrag, waitSheetSettled, readSheetGeom };
