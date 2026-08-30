import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { projectDetailInclude } from "@/lib/project-include";
import { uploadScriptSchema } from "@/lib/validations";
import { hasProjectAccessResult, requireProjectEdit } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** 步骤1：上传/粘贴现有脚本 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectEdit(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  const body = await req.json().catch(() => null);
  const parsed = uploadScriptSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: { scripts: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!project) return jsonError("项目不存在", 404);

  const nextVersion = (project.scripts[0]?.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.script.create({
      data: {
        projectId: id,
        content: parsed.data.content,
        source: "uploaded",
        version: nextVersion,
      },
    });
    await tx.project.update({
      where: { id },
      data: { status: "scripted", currentStep: "materials" },
    });
  });

  const updated = await prisma.project.findUnique({
    where: { id },
    include: projectDetailInclude,
  });
  return jsonOk({ project: updated });
}
