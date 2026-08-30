import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { generateStoryboard } from "@/lib/ai";
import { projectDetailInclude } from "@/lib/project-include";
import { ensureDialogueInPrompt, stripFigureMarks } from "@/lib/ref-annotate";
import { hasProjectAccessResult, requireProjectEdit } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** 步骤4：按脚本切分分镜提示词。本步不绑参考图，图由用户拖进提示词再标。 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectEdit(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      scripts: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!project) return jsonError("项目不存在", 404);

  const script = project.scripts[0];
  if (!script) return jsonError("请先生成或上传脚本", 400);

  let payload;
  try {
    payload = await generateStoryboard({
      title: project.title,
      script: script.content,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "分镜生成失败";
    return jsonError(msg, 502);
  }

  await prisma.$transaction(async (tx) => {
    await tx.shot.deleteMany({ where: { scriptId: script.id } });

    for (const shot of payload.shots) {
      const prompt = ensureDialogueInPrompt(
        stripFigureMarks(shot.prompt),
        shot.dialogue,
      );

      const created = await tx.shot.create({
        data: {
          scriptId: script.id,
          sequence: shot.sequence,
          title: shot.title || null,
          sceneDesc: shot.sceneDesc,
          prompt,
          dialogue: shot.dialogue || null,
          durationHint: shot.durationHint || null,
          refHints: "[]",
        },
      });

      await tx.promptRevision.create({
        data: { shotId: created.id, prompt, feedback: null },
      });
    }

    await tx.project.update({
      where: { id },
      data: { status: "storyboard", currentStep: "storyboard" },
    });
  });

  const updated = await prisma.project.findUnique({
    where: { id },
    include: projectDetailInclude,
  });
  return jsonOk({ project: updated });
}
