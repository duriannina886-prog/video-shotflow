import type { DragEvent } from "react";

export const ASSET_DND_TYPE = "text/shotflow-asset-id";
export const ASSET_DND_URL = "text/shotflow-asset-url";

export function isAssetDrag(dt: DataTransfer) {
  return Array.from(dt.types).includes(ASSET_DND_TYPE);
}

export function startAssetDrag(
  e: DragEvent,
  assetId: string,
  previewEl: HTMLImageElement | null,
) {
  e.dataTransfer.setData(ASSET_DND_TYPE, assetId);
  e.dataTransfer.effectAllowed = "copy";
  if (previewEl) {
    const ghost = previewEl.cloneNode(true) as HTMLImageElement;
    ghost.style.width = "16px";
    ghost.style.height = "16px";
    ghost.style.position = "absolute";
    ghost.style.top = "-9999px";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 8, 8);
    requestAnimationFrame(() => ghost.remove());
  }
}
