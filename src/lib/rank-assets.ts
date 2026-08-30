import { ASSET_CATEGORIES } from "@/lib/categories";
import type { Asset } from "@/lib/types";
import { displayName } from "@/lib/ref-annotate";

const CAT_HINTS: Record<string, string[]> = {
  character: ["人", "孩", "爸", "妈", "男", "女", "主角", "角色", "孩子"],
  prop: ["话筒", "麦", "屏", "产品", "道具", "车机", "中控"],
  scene: ["车", "座", "城堡", "迪斯尼", "场景", "室内", "公路", "驾驶"],
  other: ["logo", "字幕", "mv"],
};

function haystack(asset: Asset): string {
  return `${displayName(asset)} ${asset.label ?? ""} ${asset.filename ?? ""} ${asset.category}`.toLowerCase();
}

export function scoreAssetForText(asset: Asset, text: string): number {
  const t = text.toLowerCase();
  const name = displayName(asset).toLowerCase();
  let score = 0;
  if (name.length >= 2 && t.includes(name)) score += 10;
  if (asset.label && t.includes(asset.label.toLowerCase())) score += 8;
  const hints = CAT_HINTS[asset.category] ?? [];
  for (const h of hints) {
    if (t.includes(h.toLowerCase())) score += 2;
  }
  return score;
}

export function rankAssetsForShot(
  assets: Asset[],
  prompt: string,
  sceneDesc = "",
  dialogue = "",
): Asset[] {
  const text = `${prompt}\n${sceneDesc}\n${dialogue}`;
  return [...assets].sort((a, b) => {
    const ds = scoreAssetForText(b, text) - scoreAssetForText(a, text);
    if (ds !== 0) return ds;
    return a.sortOrder - b.sortOrder;
  });
}

export function suggestedAssets(
  assets: Asset[],
  prompt: string,
  sceneDesc = "",
  dialogue = "",
  limit = 6,
): Asset[] {
  const text = `${prompt}\n${sceneDesc}\n${dialogue}`;
  return rankAssetsForShot(assets, prompt, sceneDesc, dialogue)
    .filter((a) => scoreAssetForText(a, text) > 0)
    .slice(0, limit);
}

export function categoryName(key: string) {
  return ASSET_CATEGORIES.find((c) => c.key === key)?.name ?? key;
}
