const TOAST_ID = "shotflow-plugin-toast";

document.documentElement.dataset.shotflowPlugin = "ready";
window.dispatchEvent(new CustomEvent("shotflow:plugin-ready"));

document.addEventListener(
  "click",
  (event) => {
    const btn = event.target?.closest?.(".send-to-plugin");
    if (!btn) return;
    if (btn.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    void sendFromButton(btn);
  },
  true,
);

window.addEventListener("shotflow:send", (event) => {
  void sendPayload(event.detail || {});
});

async function sendFromButton(btn) {
  let images = [];
  try {
    images = JSON.parse(btn.getAttribute("data-images") || "[]");
  } catch {
    images = [];
  }
  if (!Array.isArray(images)) images = [];
  await sendPayload({
    prompt: btn.getAttribute("data-prompt") || "",
    images,
    shotId: btn.getAttribute("data-shot-id"),
    sequence: Number(btn.getAttribute("data-sequence")),
  });
}

async function sendPayload(detail) {
  const prompt = String(detail.prompt || "").trim();
  if (!prompt) {
    toast("提示词是空的，发不了", true);
    return;
  }

  const images = (Array.isArray(detail.images) ? detail.images : []).map((url) => {
    try {
      return new URL(url, location.origin).href;
    } catch {
      return url;
    }
  });

  toast("正在打开豆包并填入这一镜…");
  try {
    const res = await chrome.runtime.sendMessage({
      type: "SHOTFLOW_SEND",
      payload: {
        prompt,
        images,
        shotId: detail.shotId,
        sequence: Number.isFinite(detail.sequence) ? detail.sequence : null,
        origin: location.origin,
      },
    });
    if (!res?.ok) {
      toast(res?.error || "发送失败", true);
      return;
    }
    const extra =
      res.failedCount > 0 ? `，${res.failedCount} 张参考图没带上` : "";
    toast(`已转到豆包（${res.imageCount || 0} 张参考图${extra}）`);
  } catch (e) {
    toast(e instanceof Error ? e.message : "插件未响应，请在 chrome://extensions 确认已启用", true);
  }
}

function toast(text, isError = false) {
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = document.createElement("div");
    el.id = TOAST_ID;
    el.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "right:16px",
      "bottom:16px",
      "max-width:320px",
      "padding:10px 14px",
      "font:13px/1.45 sans-serif",
      "color:#f3efe6",
      "background:#1c1915",
      "box-shadow:0 8px 24px rgba(0,0,0,.2)",
    ].join(";");
    document.documentElement.appendChild(el);
  }
  el.style.background = isError ? "#8a1f1f" : "#0f6e56";
  el.textContent = text;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.remove(), 5000);
}
