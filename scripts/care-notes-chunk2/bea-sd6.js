// Bea Step A.1 slow-drag script (sd6) — same sample layout as sd.js for Z().
// Q(): sheetTop, composerTop, latestRowTop, classes (indices 2–4 in S rows).

window.Q = () => {
  const s = document.querySelector(".conversation-sheet");
  const t = document.querySelector("textarea");
  const rows = s?.querySelectorAll(
    ".imsg-thread--fill > li[data-activity-id], .imsg-thread > li[data-activity-id]",
  );
  const latest = rows?.length ? rows[rows.length - 1] : null;
  const g = (e) => (e ? Math.round(e.getBoundingClientRect().top) : null);
  return [
    g(s),
    g(t),
    g(latest),
    (s?.className.match(/is-[\w-]+/g) || []).join("."),
  ];
};

window.QMeta = () => {
  const s = document.querySelector(".conversation-sheet");
  const rows = s?.querySelectorAll(
    ".imsg-thread--fill > li[data-activity-id], .imsg-thread > li[data-activity-id]",
  );
  const latest = rows?.length ? rows[rows.length - 1] : null;
  const closeTy = s?.style.getPropertyValue("--sheet-close-ty").trim() || "";
  const restTy = getComputedStyle(s ?? document.body).getPropertyValue("--sheet-close-rest-ty").trim();
  return {
    latestId: latest?.getAttribute("data-activity-id"),
    latestTop: latest ? Math.round(latest.getBoundingClientRect().top) : null,
    scrollTop: document.querySelector(".imsg-thread--fill, .imsg-thread")?.scrollTop ?? 0,
    closeTy,
    restTy,
  };
};

window.raf = () => new Promise((r) => requestAnimationFrame(() => r()));
window.slp = (ms) => new Promise((r) => setTimeout(r, ms));

window.EV = (type, y, tgt) => {
  const x = Math.round(innerWidth / 2);
  const pt = { pointerdown: "pointerdown", move: "pointermove", up: "pointerup" };
  const tt = { pointerdown: "touchstart", move: "touchmove", up: "touchend" };
  tgt.dispatchEvent(
    new PointerEvent(pt[type], {
      pointerType: "touch",
      pointerId: 1,
      isPrimary: true,
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: x,
      clientY: y,
      buttons: type === "up" ? 0 : 1,
      button: type === "move" ? -1 : 0,
    }),
  );
  const tc = new Touch({ identifier: 1, target: tgt, clientX: x, clientY: y });
  tgt.dispatchEvent(
    new TouchEvent(tt[type], {
      bubbles: true,
      cancelable: true,
      composed: true,
      touches: type === "up" ? [] : [tc],
      targetTouches: type === "up" ? [] : [tc],
      changedTouches: [tc],
    }),
  );
};

window.SD = async (fromY, toY, step, ms, release = true) => {
  window.S = window.S || [];
  let tgt = window.TG;
  if (fromY !== null) {
    const s = document.querySelector(".conversation-sheet");
    tgt =
      document.elementFromPoint(Math.round(innerWidth / 2), fromY) ||
      document.querySelector(".snap-sheet-handle") ||
      s;
    window.TG = tgt;
    window.FY = fromY;
    EV("pointerdown", fromY, tgt);
    await raf();
    S.push(["down", fromY, ...Q()]);
  }
  let y = window.FY;
  const dir = Math.sign(toY - y);
  while ((toY - y) * dir > 0) {
    y += dir * Math.min(step, Math.abs(toY - y));
    EV("move", y, tgt);
    await slp(ms);
    S.push(["mv", y, ...Q()]);
  }
  window.FY = y;
  if (release) await UP();
  return S.length;
};

window.UP = async () => {
  EV("up", window.FY, window.TG);
  for (let i = 0; i < 90; i += 1) {
    await raf();
    S.push(["rel", null, ...Q()]);
  }
  return S.length;
};

window.Z = (a = 0) => {
  const r = S.slice(a);
  let o = [];
  let mxC = 0;
  let mxS = 0;
  let bad = [];
  let sf = 0;
  let sc = 0;
  for (let i = 1; i < r.length; i += 1) {
    const p = r[i - 1];
    const c = r[i];
    const dF = c[1] != null && p[1] != null ? c[1] - p[1] : null;
    const dS = c[2] - p[2];
    const dC = c[3] - p[3];
    const dM = c[4] - p[4];
    if (c[0] === "rel") {
      mxC = Math.max(mxC, Math.abs(dC));
      mxS = Math.max(mxS, Math.abs(dS));
    }
    if (dF != null) {
      sf += dF;
      sc += dC;
      const clamped =
        Math.abs(dC) <= 1 &&
        Math.abs(dS) <= 1 &&
        Math.abs(dF) > 2 &&
        c[0] === "mv";
      if (!clamped && (Math.abs(dF - dC) > 2 || Math.abs(dF - dS) > 2)) {
        bad.push(a + i);
      }
    }
    if (dF || dS || dC || dM) {
      o.push(`${a + i}:${c[0]} F${c[1]} dF${dF} dS${dS} dC${dC} dM${dM} ${c[5]}`);
    }
  }
  return (
    `${o.join(" | ")} ## ratioC/F=${sf ? (sc / sf).toFixed(2) : "-"} badSteps=${bad.join(",")} relMaxC=${mxC} relMaxS=${mxS} end=${Q().join(",")}`
  );
};
