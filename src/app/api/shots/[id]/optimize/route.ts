import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { optimizeShotPrompt } from "@/lib/ai";
import { optimizePromptSchema } from "@/lib/validations";
import {
  displayName,
  ensureDialogueInPrompt,
  reannotatePrompt,
} from "@/lib/ref-annotate";
import { hasProjectAccessResult, requireShotEdit } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** 对生成视频不满意时优化提示词，并按本镜图序重标（图N） */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireShotEdit(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  const body = await req.json().catch(() => null);
  const parsed = optimizePromptSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  const shot = await prisma.shot.findUnique({
    where: { id },
    include: {
      refs: {
        orderBy: { sortOrder: "asc" },
        include: { asset: true },
      },
    },
  });
  if (!shot) return jsonError("分镜不存在", 404);

  let nextPrompt: string;
  try {
    nextPrompt = await optimizeShotPrompt({
      sceneDesc: shot.sceneDesc,
      currentPrompt: shot.prompt,
      feedback: parsed.data.feedback,
      dialogue: shot.dialogue,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "优化失败";
    return jsonError(msg, 502);
  }

  const names = shot.refs.map((r) => displayName(r.asset));
  nextPrompt = ensureDialogueInPrompt(
    reannotatePrompt(nextPrompt, names),
    shot.dialogue,
  );

  const updated = await prisma.$transaction(async (tx) => {
    await tx.promptRevision.create({
      data: {
        shotId: id,
        prompt: nextPrompt,
        feedback: parsed.data.feedback,
      },
    });
    return tx.shot.update({
      where: { id },
      data: { prompt: nextPrompt },
      include: {
        refs: {
          orderBy: { sortOrder: "asc" },
          include: { asset: true },
        },
        revisions: { orderBy: { createdAt: "desc" } },
        videos: { orderBy: { createdAt: "desc" } },
      },
    });
  });

  return jsonOk({ shot: updated });
}
