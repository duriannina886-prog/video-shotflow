import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { suggestMaterials } from "@/lib/ai";
import { projectDetailInclude } from "@/lib/project-include";
import { hasProjectAccessResult, requireProjectEdit } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** 步骤2：根据脚本提出参考素材建议 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectEdit(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { scripts: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!project) return jsonError("项目不存在", 404);

  const script = project.scripts[0];
  if (!script) return jsonError("请先生成或上传脚本", 400);

  let payload;
  try {
    payload = await suggestMaterials({
      title: project.title,
      script: script.content,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "素材建议失败";
    return jsonError(msg, 502);
  }

  await prisma.$transaction(async (tx) => {
    await tx.materialSuggestion.deleteMany({ where: { projectId: id } });
    await tx.materialSuggestion.createMany({
      data: payload.suggestions.map((s, i) => ({
        projectId: id,
        category: s.category,
        name: s.name,
        description: s.description || "",
        sortOrder: i,
      })),
    });
    await tx.project.update({
      where: { id },
      data: { status: "materials", currentStep: "library" },
    });
  });

  const updated = await prisma.project.findUnique({
    where: { id },
    include: projectDetailInclude,
  });
  return jsonOk({ project: updated });
}
