const JOB_KEY = "shotflowJob";
let filling = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SHOTFLOW_FILL") {
    void runFill().then(
      (result) => sendResponse(result || { ok: true }),
      (err) => sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
    );
    return true;
  }
  return false;
});

void runFill();

async function runFill() {
  if (filling) return { ok: true, skipped: "busy" };
  const stored = await chrome.storage.local.get(JOB_KEY);
  const job = stored[JOB_KEY];
  if (!job || job.status === "done") return { ok: true, skipped: "no-job" };

  if (Date.now() - Number(job.createdAt || 0) > 180_000) {
    await markJob("expired");
    return { ok: true, skipped: "expired" };
  }

  filling = true;
  banner("Shotflow 正在打开豆包视频创作…");
  try {
    const login = findLoginButton();
    if (login) {
      banner("请先登录豆包，登录后再回 Shotflow 点一次「一键发送」", true);
      return { ok: false, error: "need-login" };
    }

    const ready = await enterNewChatAndVideoMode();
    if (!ready) {
      banner("已打开新对话，但没点进「视频生成」。请再点一次发送，或先手动点底栏「视频生成」。", true);
      return { ok: false, error: "no-video-mode" };
    }

    if (!(await waitFor(findEditor, 12000))) {
      banner("没找到对话框。请确认已出现「描述你想要的视频」后再点发送。", true);
      return { ok: false, error: "no-editor" };
    }

    const expected = job.images?.length || 0;
    let uploadedCount = 0;
    let countSure = true;
    if (expected) {
      const report = await uploadImages(job.images);
      uploadedCount = report.counted;
      countSure = report.sure;
    }

    banner("正在粘贴提示词…");
    const editor = findEditor();
    let filled = editor ? fillEditor(editor, job.prompt) : false;
    if (!filled) {
      const res = await chrome.runtime.sendMessage({ type: "FILL_PROMPT" });
      filled = Boolean(res?.ok);
    }
    if (!filled) {
      try {
        await navigator.clipboard.writeText(job.prompt);
      } catch {
        /* ignore */
      }
    }

    if (expected && countSure && uploadedCount < expected) {
      banner(
        filled
          ? `提示词已贴上。参考图挂到 ${uploadedCount}/${expected} 张，缺的请手动补，别重复点发送。`
          : `参考图 ${uploadedCount}/${expected} 张，提示词没贴上（已复制到剪贴板）。`,
        true,
      );
      await markJob("partial");
      return { ok: false, error: "partial-upload", uploadedCount, expected, filled };
    }

    if (!filled) {
      banner("参考图已挂上，提示词没填进去。已复制到剪贴板，请手动粘贴。", true);
      await markJob("partial");
      return { ok: false, error: "no-prompt" };
    }

    await markJob("done");
    banner(
      countSure
        ? `提示词和 ${uploadedCount} 张参考图已填好，请确认后点发送。`
        : `提示词已贴上，${expected} 张参考图已按图一到图${figureName(expected - 1)}顺序送出，请核对后发送。`,
    );
    return { ok: true, submitted: false };
  } catch (e) {
    banner(e instanceof Error ? e.message : "填入失败", true);
    return { ok: false, error: String(e) };
  } finally {
    filling = false;
  }
}

async function markJob(status) {
  await patchJob({ status });
}

async function patchJob(partial) {
  const stored = await chrome.storage.local.get(JOB_KEY);
  const job = stored[JOB_KEY];
  if (!job) return;
  await chrome.storage.local.set({ [JOB_KEY]: { ...job, ...partial } });
}

function findLoginButton() {
  const nodes = document.querySelectorAll(
    ".login-btn-head, button.login-btn, [class*='login-btn'], a[href*='login']",
  );
  for (const el of nodes) {
    const text = (el.innerText || el.textContent || "").trim();
    if (/登录|登陆|Log ?in/i.test(text) && visible(el)) return el;
  }
  return null;
}

function findExactLabel(text, { bottom = false } = {}) {
  let best = null;
  let bestArea = Infinity;
  for (const el of document.querySelectorAll("button, [role='button'], div, span, a, p")) {
    if ((el.innerText || "").trim() !== text) continue;
    const r = el.getBoundingClientRect();
    if (!visible(el) || r.width > 280 || r.height > 90) continue;
    if (bottom && r.top < window.innerHeight * 0.45) continue;
    const area = r.width * r.height;
    if (area < bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best;
}

function pageHasChatModeToolbar() {
  return Boolean(
    findExactLabel("对话", { bottom: true }) &&
      findExactLabel("视频生成", { bottom: true }) &&
      (findExactLabel("音乐生成", { bottom: true }) || findExactLabel("图像生成", { bottom: true })),
  );
}

function hasVideoPlaceholder() {
  for (const el of document.querySelectorAll(
    "textarea, [contenteditable], [placeholder], [data-placeholder], [aria-placeholder]",
  )) {
    const ph = [
      el.getAttribute("placeholder"),
      el.getAttribute("data-placeholder"),
      el.getAttribute("aria-placeholder"),
      el.getAttribute("aria-label"),
    ]
      .filter(Boolean)
      .join(" ");
    if (ph.includes("描述你想要的视频")) return true;
  }
  for (const el of document.querySelectorAll("div, span, p")) {
    if ((el.innerText || "").trim() === "描述你想要的视频" && visible(el)) return true;
  }
  return false;
}

function findVideoPill() {
  if (pageHasChatModeToolbar()) return null;
  return findExactLabel("视频生成", { bottom: true });
}

function isVideoComposerReady() {
  return hasVideoPlaceholder() && !pageHasChatModeToolbar();
}

async function enterNewChatAndVideoMode() {
  const stored = await chrome.storage.local.get(JOB_KEY);
  const job = stored[JOB_KEY] || {};

  if (!job.clickedNewChat) {
    const btn = await waitFor(findNewChatButton, 8000);
    await patchJob({ clickedNewChat: true });
    if (btn) {
      banner("正在点「新对话」…");
      btn.click();
      await sleep(1200);
    }
  }

  if (!isVideoComposerReady() || pageHasChatModeToolbar()) {
    const entry = await waitFor(findVideoModeEntry, 12000);
    if (!entry) return false;
    banner("正在点底栏「视频生成」…");
    realClick(entry);
    await sleep(400);
    if (pageHasChatModeToolbar() || !isVideoComposerReady()) {
      realClick(entry);
    }
    await waitFor(() => isVideoComposerReady(), 12000);
  }

  if (isVideoComposerReady()) {
    await patchJob({ enteredVideo: true });
    return true;
  }
  return false;
}

function findNewChatButton() {
  const nodes = [...document.querySelectorAll("button, a, div, span")];
  const hits = [];
  for (const el of nodes) {
    const t = (el.innerText || "").trim();
    if (t !== "新对话") continue;
    const r = el.getBoundingClientRect();
    if (!visible(el) || r.left > 280 || r.width > 220) continue;
    const clickable = clickableSelfOrParent(el);
    if (clickable) hits.push(clickable);
  }
  return hits[0] || null;
}

function realClick(el) {
  if (!el) return;
  try {
    el.scrollIntoView({ block: "end", behavior: "instant" });
  } catch {
    /* ignore */
  }
  const opts = { bubbles: true, cancelable: true, view: window };
  for (const [Cls, type] of [
    [PointerEvent, "pointerdown"],
    [MouseEvent, "mousedown"],
    [PointerEvent, "pointerup"],
    [MouseEvent, "mouseup"],
    [MouseEvent, "click"],
  ]) {
    try {
      el.dispatchEvent(new Cls(type, opts));
    } catch {
      /* ignore */
    }
  }
  if (typeof el.click === "function") el.click();
}

function findVideoModeEntry() {
  const video = findExactLabel("视频生成", { bottom: true }) || findExactLabel("视频创作", { bottom: true });
  if (!video) return null;
  let cur = video;
  let best = video;
  for (let i = 0; i < 5 && cur; i++) {
    const r = cur.getBoundingClientRect();
    if (r.width > 220 || r.height > 88) break;
    if (r.width >= 36 && r.height >= 20) best = cur;
    cur = cur.parentElement;
  }
  return clickableSelfOrParent(best) || best;
}

function findEditor() {
  const all = [
    ...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]'),
  ].filter(visible);
  if (!all.length) return null;

  const byPh = all.find((el) => editorPlaceholder(el).includes("描述你想要的视频"));
  if (byPh) return byPh;

  const phNode = [...document.querySelectorAll("div, span, p")].find(
    (el) => (el.innerText || "").trim() === "描述你想要的视频" && visible(el),
  );
  if (phNode) {
    const near = all.find((el) => {
      const a = el.getBoundingClientRect();
      const b = phNode.getBoundingClientRect();
      return Math.abs(a.top - b.top) < 80 && Math.abs(a.left - b.left) < 400;
    });
    if (near) return near;
  }

  if (!isVideoComposerReady()) return null;

  const pill = findVideoPill();
  if (pill) {
    let root = pill;
    for (let i = 0; i < 8 && root.parentElement; i++) {
      root = root.parentElement;
      const inner = all.find((el) => root.contains(el));
      if (inner) return inner;
    }
  }

  all.sort((a, b) => scoreEditor(b) - scoreEditor(a));
  return all[0];
}

function editorPlaceholder(el) {
  return [
    el.getAttribute("placeholder"),
    el.getAttribute("data-placeholder"),
    el.getAttribute("aria-placeholder"),
    el.getAttribute("aria-label"),
  ]
    .filter(Boolean)
    .join(" ");
}

function scoreEditor(el) {
  const r = el.getBoundingClientRect();
  const area = r.width * r.height;
  const bottom = r.top > window.innerHeight * 0.45 ? 80 : 0;
  return area + bottom * 1000;
}

function fillEditor(input, promptText) {
  const expected = normalize(promptText);
  if (normalize(readValue(input)).includes(expected.slice(0, 40))) return true;
  input.focus();

  const current = normalize(readValue(input));
  const empty =
    !current ||
    current === "描述你想要的视频" ||
    current.includes("发消息或按住空格");

  try {
    const range = document.createRange();
    range.selectNodeContents(input);
    range.collapse(empty);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    if (document.execCommand("insertText", false, promptText) && normalize(readValue(input)).includes(expected.slice(0, 40))) {
      fireInput(input, promptText);
      return true;
    }
  } catch {
    /* next */
  }

  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", promptText);
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
    if (normalize(readValue(input)).includes(expected.slice(0, 40))) return true;
  } catch {
    /* next */
  }

  if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
    const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(input, promptText);
    else input.value = promptText;
    fireInput(input, promptText);
    if (normalize(readValue(input)).includes(expected.slice(0, 40))) return true;
  }

  if (empty) input.textContent = promptText;
  fireInput(input, promptText);
  return normalize(readValue(input)).includes(expected.slice(0, 40));
}

function readValue(el) {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value || "";
  return el.innerText || el.textContent || "";
}

function fireInput(el, data) {
  try {
    el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data }));
  } catch {
    /* ignore */
  }
  try {
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data }));
  } catch {
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function commonAncestor(a, b) {
  if (!a) return b?.parentElement || b || null;
  if (!b) return a.parentElement || a;
  const seen = new Set();
  for (let el = a; el; el = el.parentElement) seen.add(el);
  for (let el = b; el; el = el.parentElement) {
    if (seen.has(el)) return el;
  }
  return a.parentElement;
}

function findComposerRoot() {
  const pill = findVideoPill();
  const editor = findEditor();
  let root = commonAncestor(editor, pill);
  while (root?.parentElement) {
    const r = root.getBoundingClientRect();
    if (r.height > window.innerHeight * 0.92) break;
    const outer = root.parentElement.getBoundingClientRect();
    if (outer.height > window.innerHeight * 0.92) break;
    if (outer.height - r.height > 220) break;
    root = root.parentElement;
  }
  return root;
}

function isThumbSized(r) {
  return r.width >= 26 && r.height >= 26 && r.width <= 240 && r.height <= 240;
}

function listComposerThumbs() {
  const editor = findEditor();
  const root = findComposerRoot() || editor?.parentElement || document.body;
  const boxes = [];

  root.querySelectorAll("img").forEach((img) => {
    if (!visible(img)) return;
    if (editor && editor.contains(img)) return;
    if (!isThumbSized(img.getBoundingClientRect())) return;
    const src = img.currentSrc || img.src || "";
    if (!src || src.includes(".svg") || src.startsWith("data:image/svg")) return;
    boxes.push({ el: img, r: img.getBoundingClientRect() });
  });

  root.querySelectorAll("div, span, canvas").forEach((node) => {
    if (!visible(node)) return;
    if (editor && editor.contains(node)) return;
    if (node.querySelector("img")) return;
    if (node.tagName !== "CANVAS") {
      const bg = window.getComputedStyle(node).backgroundImage || "";
      if (!bg.includes("url(") || bg.includes(".svg")) return;
    }
    const r = node.getBoundingClientRect();
    if (!isThumbSized(r)) return;
    boxes.push({ el: node, r });
  });

  return dedupeThumbBoxes(boxes).map((b) => b.el);
}

function dedupeThumbBoxes(boxes) {
  const kept = [];
  for (const box of boxes) {
    const hit = kept.find((k) => {
      const dx = k.r.left + k.r.width / 2 - (box.r.left + box.r.width / 2);
      const dy = k.r.top + k.r.height / 2 - (box.r.top + box.r.height / 2);
      return dx * dx + dy * dy < 14 * 14;
    });
    if (!hit) kept.push(box);
  }
  return kept;
}

function countRefThumbs() {
  return listComposerThumbs().length;
}

function figureName(index0) {
  return ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][index0] || String(index0 + 1);
}

async function uploadImages(items) {
  const total = items.length;
  findEditor()?.scrollIntoView?.({ block: "end", behavior: "instant" });
  await sleep(400);

  const baseline = countRefThumbs();
  let countable = false;

  for (let i = 0; i < total; i++) {
    const want = baseline + i + 1;
    if (countRefThumbs() >= want) {
      countable = true;
      continue;
    }

    banner(`正在点「+」挂上图${figureName(i)}（${i + 1}/${total}）…`);
    let res = await chrome.runtime.sendMessage({ type: "ADD_ONE_VIA_PLUS", index: i, cumulative: false });
    if (!res?.ok) {
      await sleep(500);
      res = await chrome.runtime.sendMessage({ type: "ADD_ONE_VIA_PLUS", index: i, cumulative: false });
    }

    if (await waitFor(() => countRefThumbs() >= want, 7000)) {
      countable = true;
      await sleep(500);
      continue;
    }

    if (countable) {
      banner(`图${figureName(i)}把前面的顶掉了，改为一次写入图一至图${figureName(i)}…`);
      await chrome.runtime.sendMessage({ type: "ADD_ONE_VIA_PLUS", index: i, cumulative: true });
      if (!(await waitFor(() => countRefThumbs() >= want, 7000))) {
        return { counted: Math.max(0, countRefThumbs() - baseline), sure: true };
      }
      await sleep(500);
      continue;
    }

    await sleep(800);
  }

  if (!countable) return { counted: total, sure: false };
  return { counted: Math.max(0, countRefThumbs() - baseline), sure: true };
}

function clickableSelfOrParent(el) {
  let cur = el;
  for (let i = 0; i < 6 && cur; i++) {
    const r = cur.getBoundingClientRect();
    if (i > 0 && (r.width > 360 || r.height > 120)) break;
    const style = window.getComputedStyle(cur);
    if (
      cur.tagName === "BUTTON" ||
      cur.tagName === "A" ||
      cur.getAttribute("role") === "button" ||
      style.cursor === "pointer"
    ) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return el;
}

function visible(el) {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return r.width > 8 && r.height > 8 && style.display !== "none" && style.visibility !== "hidden";
}

function normalize(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, timeout = 15000, interval = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = fn();
    if (v) return v;
    await sleep(interval);
  }
  return null;
}

function banner(text, isError = false) {
  const id = "shotflow-doubao-banner";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "left:50%",
      "top:16px",
      "transform:translateX(-50%)",
      "max-width:min(560px, calc(100vw - 32px))",
      "padding:10px 16px",
      "font:13px/1.5 sans-serif",
      "color:#fff",
      "border-radius:4px",
      "box-shadow:0 8px 24px rgba(0,0,0,.25)",
    ].join(";");
    document.documentElement.appendChild(el);
  }
  el.style.background = isError ? "#8a1f1f" : "#0f6e56";
  el.textContent = text;
  clearTimeout(banner._t);
  banner._t = setTimeout(() => el.remove(), isError ? 12000 : 7000);
}
