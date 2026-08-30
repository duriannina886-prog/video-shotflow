import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { displayName, reannotatePrompt } from "@/lib/ref-annotate";
import { hasProjectAccessResult, requireShotEdit } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** 按当前本镜参考图顺序，规则刷新提示词中的（图N） */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireShotEdit(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
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

  const names = shot.refs.map((r) => displayName(r.asset));
  const nextPrompt = reannotatePrompt(shot.prompt, names);

  const updated = await prisma.$transaction(async (tx) => {
    if (nextPrompt !== shot.prompt) {
      await tx.shot.update({
        where: { id },
        data: { prompt: nextPrompt },
      });
      await tx.promptRevision.create({
        data: {
          shotId: id,
          prompt: nextPrompt,
          feedback: "[reannotate refs]",
        },
      });
    }
    return tx.shot.findUniqueOrThrow({
      where: { id },
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
