import {
  materialSuggestionsSchema,
  scriptOnlySchema,
  storyboardSchema,
} from "./validations";
import { getStylePreset } from "./style-presets";
import { z } from "zod";

export type ScriptOnly = z.infer<typeof scriptOnlySchema>;
export type MaterialsPayload = z.infer<typeof materialSuggestionsSchema>;
export type StoryboardPayload = z.infer<typeof storyboardSchema>;

export type LibraryAssetInfo = {
  id: string;
  category: string;
  label: string | null;
  filename: string | null;
};

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fence?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM 未返回可解析的 JSON");
  }
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function chatCompletion(
  system: string,
  user: string,
  jsonMode = true,
): Promise<string> {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.deepseek.com").replace(
    /\/$/,
    "",
  );
  const model = process.env.LLM_MODEL ?? "deepseek-chat";

  if (!apiKey) {
    throw new Error("MISSING_LLM_API_KEY");
  }

  const body: Record<string, unknown> = {
    model,
    temperature: 0.7,
    max_tokens: jsonMode ? 4096 : 4096,
    enable_thinking: false,
    thinking: { type: "disabled" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`LLM 请求失败 (${res.status}): ${errBody.slice(0, 400)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{
          message?: { content?: string | null; reasoning_content?: string };
        }>;
      };
      const message = data.choices?.[0]?.message;
      const content =
        message?.content?.trim() || message?.reasoning_content?.trim();
      if (!content) throw new Error("LLM 返回空内容");
      return content;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      console.warn(`[llm] attempt ${attempt}/3 failed: ${lastError.message}`);
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  throw lastError ?? new Error("LLM 请求失败");
}

/** 豆包免费生视频额度用的中文脚本：角色/动作/镜头/对白/声音，不是一句话摘要 */
const VIDEO_PROMPT_RULES = `你写的 prompt 会原样粘进豆包「生视频」输入框（用户无预算调用付费视频 API）。

每条 prompt 必须是完整生视频脚本，禁止一句话摘要。按下列标题写（可换行，保留标题）：
【时长】4–8秒
【画幅】9:16竖屏
【主体】人物外貌、年龄感、服装、人物关系；车/道具
【场景】地点、日夜、光线、空间关系（谁坐哪）
【镜头】景别、机位、运动（推/拉/摇/移/手持/切点）
【动作】按时间写表情与肢体，写具体动作不要空泛形容词
【对白】角色名：「脚本原句」。语气。无人说话写「无对白」
【声音】环境声、动作音效、BGM；音效用<>，音乐用()，对白也可用{}
【不要】不要烧录字幕、不要水印、不要AI画风字样；没有旁白就不要解说

硬性规则：
1. 不要写（图一）（图二），不要写文件名或 URL。用户稍后拖参考图再标。
2. 对白必须用脚本原句，禁止改写成「争论迪斯尼」这类摘要。
3. 每条 prompt 不少于 220 个汉字。
4. 卖点只允许出现在角色动作/对白里，禁止「今天给大家推荐」。`;

export function mockScript(brief: string, sellingPoints: string): ScriptOnly {
  return {
    script: `【场1 · 开场冲突】地铁通勤，主角耳机断连，表情夸张无奈。
对白：又来了……这怎么搞得定？

【场2 · 反转】包里摸出备用方案/新产品，气氛转轻松。
对白：等等，这个好像能用？

【场3 · 验证】戴上后稳定听歌，路人侧目，喜剧点。
对白：居然真的搞定了！

【场4 · 收束】特写产品自然入画。
对白：${sellingPoints.split(/[\n,，]/)[0]?.trim() || "超稳连接，通勤必备。"}

（诉求：${brief.slice(0, 60)}｜未配置 LLM_API_KEY 时为 mock）`,
  };
}

export function mockMaterials(): MaterialsPayload {
  return {
    suggestions: [
      {
        category: "character",
        name: "主要人物",
        description: "按脚本里的角色分别收集正面/侧面参考",
      },
      {
        category: "prop",
        name: "主推产品",
        description: "脚本中的核心道具或车辆特写",
      },
      {
        category: "scene",
        name: "主场景",
        description: "脚本发生地的环境参考",
      },
    ],
  };
}

export function mockStoryboard(): StoryboardPayload {
  return {
    shots: [
      {
        sequence: 1,
        title: "开场冲突",
        sceneDesc: "近景：主角面对棘手日常场景，表情夸张无奈。",
        dialogue: "又来了……这怎么搞得定？",
        prompt: "年轻主角在日常场景中表情夸张无奈，喜剧近景，自然光，9:16竖屏\n对白：又来了……这怎么搞得定？",
        durationHint: "3s",
        matchedAssetIds: [],
        refHints: [],
      },
      {
        sequence: 2,
        title: "反转出现",
        sceneDesc: "中景：意外发现产品，气氛由乱转轻松。",
        dialogue: "等等，这个好像能用？",
        prompt: "年轻主角惊喜地拿出产品，中景，轻松喜剧，9:16竖屏\n对白：等等，这个好像能用？",
        durationHint: "3s",
        matchedAssetIds: [],
        refHints: [],
      },
      {
        sequence: 3,
        title: "场景化验证",
        sceneDesc: "跟拍：用产品解决麻烦，动作干脆有喜剧点。",
        dialogue: "居然真的搞定了！",
        prompt: "跟拍使用产品解决麻烦，喜悦反应，自然植入，9:16竖屏\n对白：居然真的搞定了！",
        durationHint: "4s",
        matchedAssetIds: [],
        refHints: [],
      },
      {
        sequence: 4,
        title: "收束种草",
        sceneDesc: "特写收尾：满意表情 + 产品自然入画。",
        dialogue: "就是这个感觉。",
        prompt: "产品特写收尾，干净种草感，9:16竖屏，无硬广大字\n对白：就是这个感觉。",
        durationHint: "3s",
        matchedAssetIds: [],
        refHints: [],
      },
    ],
  };
}

export async function generateScriptOnly(input: {
  brief: string;
  sellingPoints: string;
  stylePreset: string;
  title: string;
}): Promise<ScriptOnly> {
  if (!process.env.LLM_API_KEY) {
    return mockScript(input.brief, input.sellingPoints);
  }
  const preset = getStylePreset(input.stylePreset);
  const user = `项目标题：${input.title}
业务诉求：${input.brief}
产品卖点：${input.sellingPoints || "（未提供）"}

请只生成完整脚本 JSON。`;
  const content = await chatCompletion(preset.systemPrompt, user);
  return scriptOnlySchema.parse(extractJson(content));
}

export async function suggestMaterials(input: {
  script: string;
  title: string;
}): Promise<MaterialsPayload> {
  if (!process.env.LLM_API_KEY) return mockMaterials();

  const system = `你是短视频制片与美术指导。根据「当前这份脚本」列出拍摄/生视频所需的参考图素材清单。
分类只能是：character（人物）、prop（道具）、scene（场景图）、other（其他）。
必须紧扣本脚本的角色、产品、场景；禁止出现脚本未出现的人物、商品或地点。
只输出 JSON：
{ "suggestions": [ { "category": "character", "name": "短名", "description": "拍摄/收集要点" } ] }
覆盖脚本里出现的关键角色、主推产品、主要场景，控制在 5–15 条。`;

  const user = `项目：${input.title}\n\n脚本：\n${input.script}`;
  const content = await chatCompletion(system, user);
  return materialSuggestionsSchema.parse(extractJson(content));
}

export async function generateStoryboard(input: {
  script: string;
  title: string;
}): Promise<StoryboardPayload> {
  if (!process.env.LLM_API_KEY) {
    return mockStoryboard();
  }

  const system = `你是短视频分镜导演，也是豆包生视频提示词工程师。根据脚本切分分镜，并为每镜写可直接粘贴到豆包的生视频脚本。

${VIDEO_PROMPT_RULES}

只输出 JSON：
{
  "shots": [
    {
      "sequence": 1,
      "title": "短标题",
      "sceneDesc": "给卡片看的一句话画面",
      "dialogue": "对白原句，无对白则空字符串",
      "prompt": "完整生视频脚本（含时长画幅主体场景镜头动作对白声音不要）",
      "durationHint": "6s"
    }
  ]
}
分镜 4–8 个，每镜时长写在 durationHint 和 prompt 的【时长】里，保持一致。`;

  const user = `项目：${input.title}

脚本：
${input.script}`;

  const content = await chatCompletion(system, user);
  return storyboardSchema.parse(extractJson(content));
}

export type ExpandShotInput = {
  sequence: number;
  title: string | null;
  sceneDesc: string;
  dialogue: string | null;
  durationHint: string | null;
};

const expandOneSchema = z.object({
  sequence: z.coerce.number().int().positive().optional(),
  prompt: z.string().min(80),
});

/** 保留已有分镜结构，只重写生视频 prompt（不删镜、不碰参考图） */
export async function expandShotPrompts(input: {
  title: string;
  script: string;
  shots: ExpandShotInput[];
}): Promise<Array<{ sequence: number; prompt: string }>> {
  if (!process.env.LLM_API_KEY) {
    throw new Error("未配置 LLM_API_KEY");
  }

  const system = `你是豆包生视频提示词工程师。只为「这一镜」写一条可粘贴到豆包生视频框的完整脚本。

${VIDEO_PROMPT_RULES}

只输出 JSON：
{ "prompt": "这一镜的完整生视频脚本" }`;

  const results: Array<{ sequence: number; prompt: string }> = [];

  for (const shot of input.shots) {
    const user = `项目：${input.title}

完整脚本（只作上下文，本条只写下面这一镜）：
${input.script}

本镜：镜${shot.sequence}「${shot.title ?? ""}」建议时长${shot.durationHint ?? "6s"}
画面：${shot.sceneDesc}
对白：${shot.dialogue?.trim() || "（无对白）"}`;

    const content = await chatCompletion(system, user, false);
    let parsed;
    try {
      parsed = expandOneSchema.parse(extractJson(content));
    } catch (e) {
      throw new Error(
        `镜${shot.sequence}解析失败: ${e instanceof Error ? e.message : e}；原文前 400 字：${content.slice(0, 400)}`,
      );
    }
    results.push({ sequence: shot.sequence, prompt: parsed.prompt.trim() });
    console.info(
      `[expand] shot ${shot.sequence} ${parsed.prompt.trim().length} chars`,
    );
    await sleep(800);
  }

  return results;
}

export async function optimizeShotPrompt(input: {
  sceneDesc: string;
  currentPrompt: string;
  feedback: string;
  dialogue?: string | null;
}): Promise<string> {
  if (!process.env.LLM_API_KEY) {
    return `${input.currentPrompt}\n\n[optimized for: ${input.feedback}]`;
  }

  const system = `你是豆包生视频提示词工程师。根据用户对「已生成视频」的不满意点，改写生视频脚本。
${VIDEO_PROMPT_RULES}
不要删对白原句。只输出优化后的提示词纯文本，不要 JSON。`;

  const user = `画面：${input.sceneDesc}
对白：${input.dialogue ?? ""}
当前提示词：
${input.currentPrompt}
不满意点：${input.feedback}`;

  return (await chatCompletion(system, user, false)).trim();
}

/** 将 AI 返回的 id 或名称解析为真实 asset id */
export function resolveMatchedAssetIds(
  matched: string[],
  hints: string[],
  library: LibraryAssetInfo[],
): string[] {
  const byId = new Map(library.map((a) => [a.id, a]));
  const result: string[] = [];

  for (const token of matched) {
    if (byId.has(token) && !result.includes(token)) {
      result.push(token);
    }
  }

  const haystack = [...matched, ...hints].map((s) => s.toLowerCase());
  for (const asset of library) {
    if (result.includes(asset.id)) continue;
    const label = (asset.label || asset.filename || "").toLowerCase();
    if (!label) continue;
    if (haystack.some((h) => h.includes(label) || label.includes(h))) {
      result.push(asset.id);
    }
  }

  return result;
}
