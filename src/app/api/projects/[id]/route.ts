import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { projectDetailInclude } from "@/lib/project-include";
import { updateProjectSchema } from "@/lib/validations";
import { hasProjectAccessResult, requireProjectAccess } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectAccess(req, id);
  if (!hasProjectAccessResult(gate)) return gate;

  const project = await prisma.project.findUnique({
    where: { id },
    include: projectDetailInclude,
  });
  if (!project) return jsonError("项目不存在", 404);
  return jsonOk({ project, viewer: gate.viewer });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectAccess(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  if (!gate.viewer.canEdit) {
    return jsonError("审阅方不能修改项目与脚本", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return jsonError("项目不存在", 404);

  const project = await prisma.project.update({
    where: { id },
    data: parsed.data,
    include: projectDetailInclude,
  });
  return jsonOk({ project, viewer: gate.viewer });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectAccess(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  if (!gate.viewer.canEdit) return jsonError("审阅方不能删除项目", 403);

  const existing = await prisma.project.findUnique({ where: { id } });
  if (!existing) return jsonError("项目不存在", 404);
  await prisma.project.delete({ where: { id } });
  return jsonOk({ ok: true });
}
