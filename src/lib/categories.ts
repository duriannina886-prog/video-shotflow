/** 资源库 / 素材建议分类 */
export const ASSET_CATEGORIES = [
  { key: "character", name: "人物" },
  { key: "prop", name: "道具" },
  { key: "scene", name: "场景图" },
  { key: "other", name: "其他" },
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]["key"];

export const ASSET_CATEGORY_KEYS = ASSET_CATEGORIES.map((c) => c.key);

export function isAssetCategory(v: string): v is AssetCategory {
  return (ASSET_CATEGORY_KEYS as readonly string[]).includes(v);
}

export const WORKFLOW_STEPS = [
  { key: "script", name: "脚本", index: 1 },
  { key: "materials", name: "素材建议", index: 2 },
  { key: "library", name: "资源库", index: 3 },
  { key: "storyboard", name: "分镜提示词", index: 4 },
] as const;

export type WorkflowStep = (typeof WORKFLOW_STEPS)[number]["key"];
