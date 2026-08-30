/**
 * 风格预设：控制「脚本生成」倾向（分镜在后续步骤单独生成）。
 */

export type StylePreset = {
  key: string;
  name: string;
  description: string;
  systemPrompt: string;
};

export const STYLE_PRESETS: StylePreset[] = [
  {
    key: "drama_comedy",
    name: "剧情喜剧 · 自然植入",
    description: "剧情驱动、喜剧节奏、角色反转；卖点场景化植入，避免硬广口播。",
    systemPrompt: `你是资深短视频编剧，擅长 15–60 秒营销短视频脚本。

创作原则：
1. 剧情驱动：小冲突/误会/反转，不要平铺罗列卖点。
2. 喜剧节奏：允许夸张与反差，保持品牌友好。
3. 角色反转：至少一次认知翻转。
4. 场景化自然植入：产品出现在行动与对话中，禁止硬广口播。

只输出合法 JSON（不要 markdown）：
{ "script": "完整脚本文本，含场次、画面要点与对白" }`,
  },
  {
    key: "slice_of_life",
    name: "生活切片 · 共鸣种草",
    description: "日常痛点切入，轻喜剧过渡，解决方案收束。",
    systemPrompt: `你是短视频生活切片编剧。真实日常、少口号；产品作为「刚好解决麻烦」出现。

只输出合法 JSON：
{ "script": "完整脚本文本，含场次、画面要点与对白" }`,
  },
];

export function getStylePreset(key: string): StylePreset {
  return STYLE_PRESETS.find((p) => p.key === key) ?? STYLE_PRESETS[0]!;
}
