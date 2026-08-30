import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { updateShotSchema } from "@/lib/validations";
import { hasProjectAccessResult, requireShotAccess, requireShotEdit } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

const shotInclude = {
  refs: {
    orderBy: { sortOrder: "asc" as const },
    include: { asset: true },
  },
  revisions: { orderBy: { createdAt: "desc" as const } },
  videos: { orderBy: { createdAt: "desc" as const } },
};

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireShotAccess(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  const shot = await prisma.shot.findUnique({
    where: { id },
    include: shotInclude,
  });
  if (!shot) return jsonError("分镜不存在", 404);
  return jsonOk({ shot });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireShotEdit(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  const body = await req.json().catch(() => null);
  const parsed = updateShotSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  const existing = await prisma.shot.findUnique({ where: { id } });
  if (!existing) return jsonError("分镜不存在", 404);

  const data = parsed.data;
  const shot = await prisma.$transaction(async (tx) => {
    const updated = await tx.shot.update({
      where: { id },
      data: {
        title: data.title === undefined ? undefined : data.title,
        sceneDesc: data.sceneDesc,
        prompt: data.prompt,
        dialogue: data.dialogue === undefined ? undefined : data.dialogue,
        durationHint:
          data.durationHint === undefined ? undefined : data.durationHint,
        sequence: data.sequence,
      },
      include: shotInclude,
    });

    if (data.prompt && data.prompt !== existing.prompt) {
      await tx.promptRevision.create({
        data: {
          shotId: id,
          prompt: data.prompt,
          feedback: "[manual edit]",
        },
      });
      return tx.shot.findUniqueOrThrow({
        where: { id },
        include: shotInclude,
      });
    }

    return updated;
  });

  return jsonOk({ shot });
}
