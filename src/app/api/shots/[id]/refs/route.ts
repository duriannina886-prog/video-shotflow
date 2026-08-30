import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { setShotRefsSchema } from "@/lib/validations";
import {
  MAX_SHOT_REFS,
  displayName,
  reannotatePrompt,
} from "@/lib/ref-annotate";
import { z } from "zod";
import { hasProjectAccessResult, requireShotEdit } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

const shotInclude = {
  refs: {
    orderBy: { sortOrder: "asc" as const },
    include: { asset: true },
  },
  revisions: { orderBy: { createdAt: "desc" as const } },
  videos: { orderBy: { createdAt: "desc" as const } },
};

const bodySchema = setShotRefsSchema.extend({
  reannotate: z.boolean().optional().default(true),
  /** 显式覆盖提示词（拖入标注时用，不再跑规则重标） */
  prompt: z.string().max(16000).optional(),
});

/**
 * 调整本镜参考图顺序/列表（最多 10 张）。
 * - 传 prompt：直接采用该提示词
 * - reannotate=true 且无 prompt：规则重标
 */
export async function PUT(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireShotEdit(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  const raw = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  if (parsed.data.assetIds.length > MAX_SHOT_REFS) {
    return jsonError(`本镜参考图最多 ${MAX_SHOT_REFS} 张`);
  }

  const shot = await prisma.shot.findUnique({
    where: { id },
    include: { script: true },
  });
  if (!shot) return jsonError("分镜不存在", 404);

  const assets = await prisma.asset.findMany({
    where: {
      id: { in: parsed.data.assetIds },
      projectId: shot.script.projectId,
    },
  });
  if (assets.length !== parsed.data.assetIds.length) {
    return jsonError("存在不属于本项目的素材");
  }

  const byId = new Map(assets.map((a) => [a.id, a]));
  const ordered = parsed.data.assetIds.map((aid) => byId.get(aid)!);
  const names = ordered.map((a) => displayName(a));

  let nextPrompt = shot.prompt;
  if (parsed.data.prompt !== undefined) {
    nextPrompt = parsed.data.prompt;
  } else if (parsed.data.reannotate) {
    nextPrompt = reannotatePrompt(shot.prompt, names);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.shotAsset.deleteMany({ where: { shotId: id } });
    for (let i = 0; i < parsed.data.assetIds.length; i++) {
      await tx.shotAsset.create({
        data: {
          shotId: id,
          assetId: parsed.data.assetIds[i]!,
          sortOrder: i,
        },
      });
    }

    if (nextPrompt !== shot.prompt) {
      await tx.shot.update({
        where: { id },
        data: { prompt: nextPrompt },
      });
      await tx.promptRevision.create({
        data: {
          shotId: id,
          prompt: nextPrompt,
          feedback: parsed.data.prompt !== undefined
            ? "[prompt drop annotate]"
            : "[reannotate refs]",
        },
      });
    }

    return tx.shot.findUniqueOrThrow({
      where: { id },
      include: shotInclude,
    });
  });

  return jsonOk({ shot: updated });
}
