import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { isAccess, requireOwner } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  projectIds: z.array(z.string().min(1)).min(1).optional(),
  revoke: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const access = await requireOwner(req);
  if (!isAccess(access)) return access;
  const { id } = await ctx.params;
  const existing = await prisma.reviewLink.findUnique({ where: { id } });
  if (!existing) return jsonError("链接不存在", 404);

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  if (parsed.data.projectIds) {
    await prisma.reviewLinkProject.deleteMany({ where: { reviewLinkId: id } });
    await prisma.reviewLinkProject.createMany({
      data: parsed.data.projectIds.map((projectId) => ({
        reviewLinkId: id,
        projectId,
      })),
    });
  }

  const link = await prisma.reviewLink.update({
    where: { id },
    data: {
      name: parsed.data.name,
      revokedAt: parsed.data.revoke ? new Date() : undefined,
    },
    include: { projects: true },
  });

  return jsonOk({
    link: {
      id: link.id,
      token: link.token,
      name: link.name,
      revokedAt: link.revokedAt,
      createdAt: link.createdAt,
      projectIds: link.projects.map((p) => p.projectId),
    },
  });
}
