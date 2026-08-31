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

  if (Date.now() - Number(job.createdAt || 0) > 90_000) {
    await markJob("expired");
    return { ok: true, skipped: "expired" };
  }

  filling = true;
  banner("Shotflow 正在填入提示词和参考图…");
  try {
    const login = findLoginButton();
    if (login) {
      banner("请先登录豆包，登录后再回 Shotflow 点一次「一键发送」", true);
      return { ok: false, error: "need-login" };
    }

    await maybeGoVideoMode();
    const editor = await waitFor(findEditor, 18000);
    if (!editor) {
      banner("没找到豆包输入框。请确认已打开「视频生成」页后再点发送。", true);
      return { ok: false, error: "no-editor" };
    }

    const filled = fillEditor(editor, job.prompt);
    if (!filled) {
      banner("提示词没填进去。请手动粘贴后生成。", true);
      try {
        await navigator.clipboard.writeText(job.prompt);
      } catch {
        /* ignore */
      }
    }

    if (job.images?.length) {
      const uploaded = await uploadImages(job.images);
      if (!uploaded) {
        banner("提示词已填。参考图没挂上，请点上传后按图一→图十顺序添加。", true);
        await markJob("partial");
        return { ok: false, error: "upload-failed" };
      }
    }

    await sleep(600);
    const submitted = clickGenerateVideo() || clickSubmitNearEditor();
    await markJob("done");
    if (submitted) {
      banner("已提交到豆包生视频。生成完成后把成片传回 Shotflow。");
    } else {
      banner("提示词和参考图已填好，请确认后点「生成视频」。");
    }
    return { ok: true, submitted };
  } catch (e) {
    banner(e instanceof Error ? e.message : "填入失败", true);
    return { ok: false, error: String(e) };
  } finally {
    filling = false;
  }
}

async function markJob(status) {
  const stored = await chrome.storage.local.get(JOB_KEY);
  const job = stored[JOB_KEY];
  if (!job) return;
  await chrome.storage.local.set({ [JOB_KEY]: { ...job, status } });
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

async function maybeGoVideoMode() {
  if (/create-video/.test(location.pathname)) return;
  const tab = [...document.querySelectorAll("button, [role='tab'], div, span")].find((el) => {
    const t = (el.innerText || "").trim();
    return (t === "视频" || t === "视频生成" || t === "生成视频") && visible(el);
  });
  if (tab) tab.click();
  await sleep(400);
}

function findEditor() {
  const preferred = document.querySelector(
    '[data-testid="chat_input_input"], [contenteditable="true"][class*="editor"]',
  );
  if (preferred && visible(preferred)) return preferred;

  const all = [
    ...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]'),
  ].filter(visible);
  if (!all.length) return null;
  all.sort((a, b) => scoreEditor(b) - scoreEditor(a));
  return all[0];
}

function scoreEditor(el) {
  const r = el.getBoundingClientRect();
  const area = r.width * r.height;
  const bottom = r.top > window.innerHeight * 0.45 ? 80 : 0;
  return area + bottom * 1000;
}

function fillEditor(input, promptText) {
  const expected = normalize(promptText);
  input.focus();

  try {
    const range = document.createRange();
    range.selectNodeContents(input);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    if (document.execCommand("insertText", false, promptText) && normalize(readValue(input)) === expected) {
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
    if (normalize(readValue(input)) === expected) return true;
  } catch {
    /* next */
  }

  if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
    const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc?.set) desc.set.call(input, promptText);
    else input.value = promptText;
    fireInput(input, promptText);
    if (normalize(readValue(input)) === expected) return true;
  }

  input.textContent = promptText;
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

function dataUrlToFile(item) {
  const raw = String(item.dataUrl || "").split(",")[1] || "";
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], item.name || "ref.jpg", { type: item.mime || "image/jpeg" });
}

function findFileInput() {
  const testid = document.querySelector('[data-testid="upload-file-input"]');
  if (testid) return testid;
  const inputs = [...document.querySelectorAll('input[type="file"]')];
  const image = inputs.find((el) => /image|png|jpe?g|webp|\*/i.test(el.accept || "") || !el.accept);
  return image || inputs[0] || null;
}

async function revealFileInput() {
  const labels = ["参考图", "上传图片", "添加图片", "上传", "图片"];
  const clickables = [...document.querySelectorAll("button, [role='button'], div, span")];
  for (const label of labels) {
    const el = clickables.find((node) => {
      const t = (node.innerText || "").trim();
      return t === label && visible(node);
    });
    if (el) {
      el.click();
      await sleep(350);
      const input = findFileInput();
      if (input) return input;
    }
  }
  return findFileInput();
}

async function uploadImages(items) {
  const files = items.map(dataUrlToFile);
  let input = findFileInput() || (await revealFileInput());
  if (!input) {
    const editor = findEditor();
    if (editor) return dropFiles(editor, files);
    return false;
  }

  const before = countAttachments();
  if (input.multiple || files.length === 1) {
    assignFiles(input, files);
  } else {
    for (const file of files) {
      input = findFileInput() || input;
      assignFiles(input, [file]);
      await sleep(450);
    }
  }

  const ok = await waitFor(() => countAttachments() >= before + Math.min(files.length, 1), 12000);
  if (ok) return true;
  const editor = findEditor();
  if (editor) return dropFiles(editor, files);
  return false;
}

function assignFiles(input, files) {
  const dt = new DataTransfer();
  for (const file of files) dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function dropFiles(target, files) {
  const dt = new DataTransfer();
  for (const file of files) dt.items.add(file);
  const r = target.getBoundingClientRect();
  const opts = {
    bubbles: true,
    cancelable: true,
    dataTransfer: dt,
    clientX: r.left + Math.min(40, r.width / 2),
    clientY: r.top + Math.min(20, r.height / 2),
  };
  target.dispatchEvent(new DragEvent("dragenter", opts));
  target.dispatchEvent(new DragEvent("dragover", opts));
  target.dispatchEvent(new DragEvent("drop", opts));
  return true;
}

function countAttachments() {
  const editor = findEditor();
  let root = editor;
  for (let i = 0; i < 8 && root?.parentElement; i++) root = root.parentElement;
  root = root || document.body;
  return root.querySelectorAll(
    'img, [class*="thumb"], [class*="preview"], [class*="attachment"], [class*="upload-item"]',
  ).length;
}

function clickGenerateVideo() {
  const viewportH = window.innerHeight;
  const candidates = [];
  for (const el of document.querySelectorAll("div, span, button, a, p")) {
    const direct = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent || "")
      .join("")
      .trim();
    if (direct !== "生成视频") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) continue;
    if (rect.top < 180 || rect.top > viewportH * 0.88) continue;
    const clickTarget = clickableSelfOrParent(el);
    if (!clickTarget) continue;
    candidates.push({ el: clickTarget, top: rect.top, w: rect.width });
  }
  if (!candidates.length) {
    const loose = [...document.querySelectorAll("button, [role='button']")].find((el) => {
      const t = (el.innerText || "").trim();
      return t === "生成视频" && visible(el);
    });
    if (loose) {
      loose.click();
      return true;
    }
    return false;
  }
  candidates.sort((a, b) => b.w - a.w);
  candidates[0].el.click();
  return true;
}

function clickSubmitNearEditor() {
  const editor = findEditor();
  if (!editor) return false;
  let root = editor;
  for (let i = 0; i < 6 && root?.parentElement; i++) root = root.parentElement;
  const btn = root?.querySelector('button[type="submit"]');
  if (btn && !btn.disabled && visible(btn)) {
    btn.click();
    return true;
  }
  return false;
}

function clickableSelfOrParent(el) {
  let cur = el;
  for (let i = 0; i < 5 && cur; i++) {
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
  return null;
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
