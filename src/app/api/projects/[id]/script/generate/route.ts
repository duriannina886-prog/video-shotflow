import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { generateScriptOnly } from "@/lib/ai";
import { projectDetailInclude } from "@/lib/project-include";
import { hasProjectAccessResult, requireProjectEdit } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** 步骤1：AI 生成脚本（不含分镜） */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectEdit(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { scripts: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!project) return jsonError("项目不存在", 404);

  let generated;
  try {
    generated = await generateScriptOnly({
      title: project.title,
      brief: project.brief,
      sellingPoints: project.sellingPoints,
      stylePreset: project.stylePreset,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "生成失败";
    return jsonError(msg, 502);
  }

  const nextVersion = (project.scripts[0]?.version ?? 0) + 1;

  await prisma.$transaction(async (tx) => {
    await tx.script.create({
      data: {
        projectId: project.id,
        content: generated.script,
        source: "generated",
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
