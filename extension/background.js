const DOUBAO_CHAT_URL = "https://www.doubao.com/chat/";
const JOB_KEY = "shotflowJob";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SHOTFLOW_SEND") {
    handleSend(message.payload)
      .then((ok) => sendResponse({ ok: true, ...ok }))
      .catch((err) =>
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    return true;
  }
  if (message?.type === "ADD_ONE_VIA_PLUS") {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: "no-tab" });
      return false;
    }
    addOneViaPlusOnTab(tabId, message.index, Boolean(message.cumulative))
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    return true;
  }
  if (message?.type === "FILL_PROMPT") {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      sendResponse({ ok: false, error: "no-tab" });
      return false;
    }
    fillPromptOnTab(tabId)
      .then((result) => sendResponse(result))
      .catch((err) =>
        sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      );
    return true;
  }
  if (message?.type === "SHOTFLOW_PING") {
    sendResponse({ ok: true, plugin: true });
    return false;
  }
  return false;
});

async function handleSend(payload) {
  const prompt = String(payload?.prompt || "").trim();
  if (!prompt) throw new Error("提示词是空的");

  const urls = Array.isArray(payload?.images) ? payload.images.filter(Boolean) : [];
  const images = [];
  const failed = [];

  for (let i = 0; i < urls.length; i++) {
    const url = absolutize(urls[i], payload.origin);
    try {
      images.push(await fetchAsFile(url, payload.sequence, i));
    } catch (e) {
      failed.push({ url, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const job = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    prompt,
    images,
    failed,
    sequence: payload.sequence ?? null,
    shotId: payload.shotId ?? null,
    createdAt: Date.now(),
    status: "pending",
  };

  await chrome.storage.local.set({ [JOB_KEY]: job });
  await openDoubaoAndFill();
  return { jobId: job.id, imageCount: images.length, failedCount: failed.length };
}

function absolutize(url, origin) {
  if (!url) return url;
  try {
    return new URL(url, origin || undefined).href;
  } catch {
    return url;
  }
}

async function fetchAsFile(url, sequence, index) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`图片 ${index + 1} 下载失败 (${res.status})`);
  const blob = await res.blob();
  const buf = await blob.arrayBuffer();
  const mime = blob.type || guessMime(url);
  const ext = extFromMime(mime);
  const seq = sequence == null ? "" : `镜${Number(sequence) + 1}-`;
  return {
    name: `${seq}图${index + 1}${ext}`,
    mime,
    dataUrl: `data:${mime};base64,${arrayBufferToBase64(buf)}`,
  };
}

function guessMime(url) {
  const path = String(url).split("?")[0].toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function extFromMime(mime) {
  if (mime.includes("png")) return ".png";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  return ".jpg";
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function openDoubaoAndFill() {
  const tabs = await chrome.tabs.query({ url: ["https://www.doubao.com/*", "https://*.doubao.com/*"] });
  const existing = tabs.find((t) => t.id != null);
  const tabId = existing?.id
    ? (
        await chrome.tabs.update(existing.id, {
          url: DOUBAO_CHAT_URL,
          active: true,
        })
      ).id
    : (await chrome.tabs.create({ url: DOUBAO_CHAT_URL, active: true })).id;

  if (tabId != null) {
    try {
      await chrome.windows.update(existing?.windowId || (await chrome.tabs.get(tabId)).windowId, {
        focused: true,
      });
    } catch {
      /* ignore */
    }
    await waitTabComplete(tabId);
    await pingFill(tabId);
  }
}

function waitTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 20000);

    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);

    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {});
  });
}

async function pingFill(tabId) {
  for (let i = 0; i < 8; i++) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "SHOTFLOW_FILL" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}

async function addOneViaPlusOnTab(tabId, index, cumulative) {
  const stored = await chrome.storage.local.get(JOB_KEY);
  const images = stored[JOB_KEY]?.images || [];
  const slice = cumulative ? images.slice(0, index + 1) : images.slice(index, index + 1);
  if (!slice.length) return { ok: false, error: "no-image", index };

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: addOneViaPlusInPage,
    args: [slice, index],
  });
  return results?.[0]?.result || { ok: false, error: "no-result" };
}

async function addOneViaPlusInPage(fileDataList, index) {
  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    return r.width > 8 && r.height > 8 && style.display !== "none" && style.visibility !== "hidden";
  }

  function toFile(item, itemIndex) {
    var raw = String(item.dataUrl || "").split(",")[1] || "";
    var binary = atob(raw);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], item.name || "ref.jpg", {
      type: item.mime || "image/jpeg",
      lastModified: Date.now() + (itemIndex + 1) * 17,
    });
  }

  function hasBottomLabel(text) {
    var nodes = document.querySelectorAll("button, [role='button'], div, span");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if ((el.innerText || "").trim() !== text) continue;
      var r = el.getBoundingClientRect();
      if (!visible(el) || r.top < window.innerHeight * 0.45 || r.width > 280) continue;
      return el;
    }
    return null;
  }

  function pageHasChatModeToolbar() {
    return Boolean(
      hasBottomLabel("对话") &&
        hasBottomLabel("视频生成") &&
        (hasBottomLabel("音乐生成") || hasBottomLabel("图像生成")),
    );
  }

  function findVideoPill() {
    if (pageHasChatModeToolbar()) return null;
    return hasBottomLabel("视频生成");
  }

  function findPlus() {
    var pill = findVideoPill();
    if (!pill) return null;
    var pr = pill.getBoundingClientRect();
    var cy = pr.top + pr.height / 2;
    var root = pill;
    for (var d = 0; d < 10 && root.parentElement; d++) {
      if (root.parentElement.getBoundingClientRect().width > window.innerWidth * 0.85) break;
      root = root.parentElement;
    }
    var best = null;
    var bestGap = 160;
    var selectors = ["button, [role='button']", "div, span"];
    for (var s = 0; s < selectors.length && !best; s++) {
      var btns = root.querySelectorAll(selectors[s]);
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (!visible(b)) continue;
        var r = b.getBoundingClientRect();
        if (r.width > 56 || r.height > 56) continue;
        if (r.right > pr.left + 6) continue;
        if (Math.abs(r.top + r.height / 2 - cy) > 32) continue;
        var text = (b.innerText || "").trim();
        if (text && text.length > 2 && text.indexOf("+") < 0 && text.indexOf("＋") < 0) continue;
        var label = ((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "")).toLowerCase();
        var looksPlus =
          text === "+" ||
          text === "＋" ||
          /上传|添加|附件|图片|本地/.test(label) ||
          text.length === 0;
        if (!looksPlus && text.length > 0) continue;
        var gap = pr.left - r.right;
        if (gap >= -4 && gap < bestGap) {
          best = b;
          bestGap = gap;
        }
      }
    }
    return best;
  }

  function clickMenuImage() {
    var menus = document.querySelectorAll('[role="menu"], [role="listbox"], [class*="popover"], [class*="dropdown"]');
    var scopes = menus.length ? Array.from(menus) : [document];
    for (var s = 0; s < scopes.length; s++) {
      var nodes = scopes[s].querySelectorAll('[role="menuitem"], [role="option"], button, li, div, span');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var t = (el.innerText || "").trim();
        if ((t === "图片" || t === "照片" || t === "本地图片") && visible(el)) {
          el.click();
          return true;
        }
      }
    }
    return false;
  }

  function imageInputs() {
    return Array.from(document.querySelectorAll('input[type="file"]')).filter(function (inp) {
      var a = (inp.accept || "").toLowerCase();
      return !(a.indexOf("audio") >= 0 && a.indexOf("image") < 0);
    });
  }

  function hangFiles(inp, files) {
    var dt = new DataTransfer();
    for (var i = 0; i < files.length; i++) dt.items.add(files[i]);
    try {
      if (files.length > 1) {
        inp.multiple = true;
        inp.setAttribute("multiple", "");
      } else {
        inp.multiple = false;
        inp.removeAttribute("multiple");
      }
    } catch (e) {}

    var applied = 0;
    try {
      delete inp.files;
    } catch (e) {}
    try {
      inp.files = dt.files;
      applied = inp.files ? inp.files.length : 0;
    } catch (e) {}

    if (applied !== files.length) {
      try {
        Object.defineProperty(inp, "files", {
          configurable: true,
          enumerable: true,
          get: function () {
            return dt.files;
          },
        });
        applied = inp.files.length;
      } catch (e) {}
    }

    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    return applied;
  }

  var files = fileDataList.map(toFile);
  var plus = findPlus();
  if (!plus) return { ok: false, error: "no-plus", index: index };

  var before = imageInputs();
  var lastClicked = null;
  function blockPicker(e) {
    var t = e.target;
    if (t && t.tagName === "INPUT" && t.type === "file") {
      e.preventDefault();
      lastClicked = t;
    }
  }
  document.addEventListener("click", blockPicker, true);

  var protoClick = HTMLInputElement.prototype.click;
  HTMLInputElement.prototype.click = function () {
    if (this.type === "file") {
      lastClicked = this;
      return;
    }
    return protoClick.apply(this, arguments);
  };
  var protoShow = HTMLInputElement.prototype.showPicker;
  if (protoShow) {
    HTMLInputElement.prototype.showPicker = function () {
      if (this.type === "file") {
        lastClicked = this;
        return;
      }
      return protoShow.apply(this, arguments);
    };
  }

  try {
    plus.click();
    await sleep(index === 0 ? 420 : 200);
    clickMenuImage();
    await sleep(index === 0 ? 280 : 140);

    var after = imageInputs();
    var fresh = after.find(function (i) {
      return before.indexOf(i) < 0;
    });
    var inp = fresh || lastClicked || after[after.length - 1];
    if (!inp) return { ok: false, error: "no-input", index: index, plus: true };

    var assigned = hangFiles(inp, files);
    await sleep(400);
    return {
      ok: assigned > 0,
      assigned: assigned,
      index: index,
      name: files.map(function (f) {
        return f.name;
      }).join(","),
    };
  } finally {
    document.removeEventListener("click", blockPicker, true);
    HTMLInputElement.prototype.click = protoClick;
    if (protoShow) HTMLInputElement.prototype.showPicker = protoShow;
  }
}

async function fillPromptOnTab(tabId) {
  const stored = await chrome.storage.local.get(JOB_KEY);
  const prompt = stored[JOB_KEY]?.prompt || "";
  if (!prompt) return { ok: false, error: "no-prompt" };

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: fillPromptInPage,
    args: [prompt],
  });
  return results?.[0]?.result || { ok: false, error: "no-result" };
}

async function fillPromptInPage(promptText) {
  function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    var style = window.getComputedStyle(el);
    return r.width > 8 && r.height > 8 && style.display !== "none" && style.visibility !== "hidden";
  }

  function sleep(ms) {
    return new Promise(function (r) {
      setTimeout(r, ms);
    });
  }

  function normalize(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function readValue(el) {
    if (!el) return "";
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") return el.value || "";
    return el.innerText || el.textContent || "";
  }

  function findEditor() {
    var all = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]'),
    ).filter(visible);
    var ph = Array.from(document.querySelectorAll("div, span, p, textarea")).find(function (el) {
      return (el.innerText || el.getAttribute("placeholder") || "").trim() === "描述你想要的视频" && visible(el);
    });
    if (ph) {
      var near = all.find(function (el) {
        var a = el.getBoundingClientRect();
        var b = ph.getBoundingClientRect();
        return Math.abs(a.top - b.top) < 100 && Math.abs(a.left - b.left) < 480;
      });
      if (near) return near;
      if (ph.getAttribute("contenteditable") || ph.tagName === "TEXTAREA") return ph;
    }
    var preferred = document.querySelector(
      '[data-testid="chat_input_input"], [contenteditable="true"][class*="editor"]',
    );
    if (preferred && visible(preferred)) return preferred;
    all.sort(function (a, b) {
      var ra = a.getBoundingClientRect();
      var rb = b.getBoundingClientRect();
      var sa = ra.width * ra.height + (ra.top > window.innerHeight * 0.45 ? 80000 : 0);
      var sb = rb.width * rb.height + (rb.top > window.innerHeight * 0.45 ? 80000 : 0);
      return sb - sa;
    });
    return all[0] || null;
  }

  var editor = findEditor();
  if (!editor) return { ok: false, error: "no-editor" };

  var expected = normalize(promptText).slice(0, 40);
  if (normalize(readValue(editor)).indexOf(expected) >= 0) return { ok: true, already: true };

  editor.scrollIntoView({ block: "end", behavior: "instant" });
  editor.click();
  editor.focus();
  await sleep(80);

  try {
    var range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(true);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  } catch (e) {}

  var inserted = false;
  try {
    inserted = document.execCommand("insertText", false, promptText);
  } catch (e) {}

  if (!inserted || normalize(readValue(editor)).indexOf(expected) < 0) {
    try {
      var dt = new DataTransfer();
      dt.setData("text/plain", promptText);
      editor.dispatchEvent(
        new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }),
      );
    } catch (e) {}
  }

  if (normalize(readValue(editor)).indexOf(expected) < 0) {
    try {
      editor.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: promptText,
        }),
      );
      editor.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: promptText }),
      );
    } catch (e) {}
  }

  if (normalize(readValue(editor)).indexOf(expected) < 0 && (editor.tagName === "TEXTAREA" || editor.tagName === "INPUT")) {
    var proto = editor.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(editor, promptText);
    else editor.value = promptText;
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
  }

  return { ok: normalize(readValue(editor)).indexOf(expected) >= 0 };
}
