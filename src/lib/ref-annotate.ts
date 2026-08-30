/** 本镜生视频参考图：最多 10 张；图几 = 发送顺序下标 */

export const MAX_SHOT_REFS = 10;

const FIGURE_CN = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"] as const;

/** 0-based → 图一 … 图十 */
export function toFigureName(index0: number): string {
  if (index0 >= 0 && index0 < FIGURE_CN.length) {
    return `图${FIGURE_CN[index0]}`;
  }
  return `图${index0 + 1}`;
}

const FIGURE_MARK_RE =
  /[（(]\s*图\s*[一二三四五六七八九十百零\d]+\s*[）)]/g;

export function stripFigureMarks(prompt: string): string {
  return prompt
    .replace(FIGURE_MARK_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 生视频提示词必须带上对白；已包含则不重复追加 */
export function ensureDialogueInPrompt(
  prompt: string,
  dialogue?: string | null,
): string {
  const visual = prompt.trim();
  const line = dialogue?.trim();
  if (!line) return visual;
  if (/【对白】/.test(visual)) return visual;
  const compact = (s: string) => s.replace(/\s+/g, "");
  if (compact(visual).includes(compact(line).slice(0, Math.min(16, line.length)))) {
    return visual;
  }
  return `${visual}\n对白：${line}`;
}

export type RefNameSource = {
  label?: string | null;
  filename?: string | null;
  category: string;
};

const BAD_NAME = /^(截屏|屏幕快照|screenshot|image|img|dsc_|photo|微信图片|img_)/i;

export function displayName(asset: RefNameSource): string {
  const raw = (asset.label || asset.filename || "")
    .replace(/\.[^.]+$/, "")
    .trim();
  if (raw && !BAD_NAME.test(raw) && raw.length <= 32) {
    return raw;
  }
  const catName: Record<string, string> = {
    character: "角色",
    prop: "道具",
    scene: "场景",
    other: "素材",
  };
  const prefix = catName[asset.category] ?? "素材";
  if (raw) return `${prefix}-${raw.slice(0, 10)}`;
  return prefix;
}

const CAT_RANK: Record<string, number> = {
  character: 0,
  prop: 1,
  scene: 2,
  other: 3,
};

/** 本镜参考图排序：人物 → 道具 → 场景 → 其他，并截断到 10 张 */
export function orderAndCapRefIds(
  ids: string[],
  library: Array<{ id: string; category: string }>,
): string[] {
  const byId = new Map(library.map((a) => [a.id, a]));
  const unique = [...new Set(ids)].filter((id) => byId.has(id));
  unique.sort((a, b) => {
    const ca = CAT_RANK[byId.get(a)!.category] ?? 9;
    const cb = CAT_RANK[byId.get(b)!.category] ?? 9;
    return ca - cb;
  });
  return unique.slice(0, MAX_SHOT_REFS);
}

/**
 * 按当前参考图顺序，规则重标提示词中的（图N）。
 * - 先去掉旧图注
 * - 若文案中出现素材短名，在首次出现后插入（图N）
 * - 未出现在文案中的，追加到末尾「参考图：…」
 */
export function reannotatePrompt(prompt: string, names: string[]): string {
  const cleanedNames = names.map((n) => n.trim()).filter(Boolean);
  if (!cleanedNames.length) return stripFigureMarks(prompt);

  let text = stripFigureMarks(prompt);

  for (let i = 0; i < cleanedNames.length; i++) {
    const name = cleanedNames[i]!;
    const mark = `（${toFigureName(i)}）`;
    const idx = text.indexOf(name);
    if (idx === -1) continue;
    text =
      text.slice(0, idx + name.length) + mark + text.slice(idx + name.length);
  }

  const missing = cleanedNames
    .map((name, i) => {
      const mark = `（${toFigureName(i)}）`;
      return text.includes(mark) ? null : `${name}${mark}`;
    })
    .filter((x): x is string => Boolean(x));

  if (missing.length) {
    text = `${text.trim()} 参考图：${missing.join("，")}`;
  }

  return text.trim();
}

/** 从提示词解析出现的最大图序号（1-based）；无法解析返回 0 */
export function maxFigureIndexInPrompt(prompt: string): number {
  const cnMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  let max = 0;
  const re = /[（(]\s*图\s*([一二三四五六七八九十]+|\d+)\s*[）)]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt))) {
    const raw = m[1]!;
    const n = cnMap[raw] ?? Number.parseInt(raw, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export type FigureValidation =
  | { ok: true }
  | { ok: false; message: string };

export function validatePromptFigures(
  prompt: string,
  refCount: number,
): FigureValidation {
  const maxFig = maxFigureIndexInPrompt(prompt);
  if (maxFig > 0 && refCount === 0) {
    return { ok: true };
  }
  if (refCount > MAX_SHOT_REFS) {
    return {
      ok: false,
      message: `本镜参考图不能超过 ${MAX_SHOT_REFS} 张（当前 ${refCount}）`,
    };
  }
  if (maxFig > refCount) {
    return {
      ok: false,
      message: `提示词写到「图${FIGURE_CN[maxFig - 1] ?? maxFig}」，但本镜只有 ${refCount} 张参考图，请刷新图注或调整图片`,
    };
  }
  if (maxFig === 0 && refCount > 0) {
    return {
      ok: false,
      message: "本镜已有参考图，但提示词未标注图几，请点击「按当前图序刷新标注」",
    };
  }
  return { ok: true };
}

/** 供 LLM 的本镜图序说明 */
export function formatRefLegend(
  refs: Array<{ name: string; figure: string }>,
): string {
  if (!refs.length) return "（本镜无参考图）";
  return refs.map((r) => `${r.figure}=${r.name}`).join("；");
}

const CN_TO_NUM: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

/** 在字符下标处插入（图N）；若该处已有图注则先跳过/替换紧邻图注 */
export function insertFigureMarkAt(
  prompt: string,
  charIndex: number,
  figureIndex0: number,
): string {
  const i = Math.max(0, Math.min(charIndex, prompt.length));
  const mark = `（${toFigureName(figureIndex0)}）`;
  // 若落点正好在已有图注上，替换该图注
  const around = prompt.slice(Math.max(0, i - 8), i + 8);
  const atMark = around.match(/[（(]\s*图\s*[一二三四五六七八九十\d]+\s*[）)]/);
  if (atMark && atMark.index !== undefined) {
    const absStart = Math.max(0, i - 8) + atMark.index;
    const absEnd = absStart + atMark[0].length;
    if (i >= absStart && i <= absEnd) {
      return prompt.slice(0, absStart) + mark + prompt.slice(absEnd);
    }
  }
  return prompt.slice(0, i) + mark + prompt.slice(i);
}

/** 删除第 figureIndex0 张对应的图注，并把更大序号依次减一 */
export function removeFigureMarkAndRenumber(
  prompt: string,
  figureIndex0: number,
): string {
  const target = figureIndex0 + 1;
  const re = /[（(]\s*图\s*([一二三四五六七八九十]+|\d+)\s*[）)]/g;
  type Hit = { start: number; end: number; n: number; raw: string };
  const hits: Hit[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(prompt))) {
    const raw = m[1]!;
    const n = CN_TO_NUM[raw] ?? Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) continue;
    hits.push({ start: m.index, end: m.index + m[0].length, n, raw: m[0] });
  }

  const targetHit = hits.find((h) => h.n === target);
  let text = prompt;
  if (targetHit) {
    text = text.slice(0, targetHit.start) + text.slice(targetHit.end);
  }

  // 重新扫描并重编号：按出现顺序写成 图一、图二…
  // 但用户语义是「图N = 本镜第 N 张」，删第 k 张后原图k+1 应变图k。
  // 按原数字减一，而不是按出现顺序重排，避免文案位置错乱。
  return text.replace(
    /[（(]\s*图\s*([一二三四五六七八九十]+|\d+)\s*[）)]/g,
    (full, raw: string) => {
      const n = CN_TO_NUM[raw] ?? Number.parseInt(raw, 10);
      if (!Number.isFinite(n)) return full;
      if (n === target) return "";
      if (n > target) return `（${toFigureName(n - 2)}）`;
      return `（${toFigureName(n - 1)}）`;
    },
  );
}
