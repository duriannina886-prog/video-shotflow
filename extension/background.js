const DOUBAO_VIDEO_URL = "https://www.doubao.com/chat/create-video";
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
          url: DOUBAO_VIDEO_URL,
          active: true,
        })
      ).id
    : (await chrome.tabs.create({ url: DOUBAO_VIDEO_URL, active: true })).id;

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
