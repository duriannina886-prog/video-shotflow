import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { expandShotPrompts } from "@/lib/ai";
import { projectDetailInclude } from "@/lib/project-include";
import {
  displayName,
  ensureDialogueInPrompt,
  reannotatePrompt,
  stripFigureMarks,
} from "@/lib/ref-annotate";

type Ctx = { params: Promise<{ id: string }> };

import { hasProjectAccessResult, requireProjectEdit } from "@/lib/access";

export const maxDuration = 120;

/** 保留分镜与参考图，只用大模型重写生视频脚本全文 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectEdit(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      scripts: {
        orderBy: { version: "desc" },
        take: 1,
        include: {
          shots: {
            orderBy: { sequence: "asc" },
            include: {
              refs: {
                orderBy: { sortOrder: "asc" },
                include: { asset: true },
              },
            },
          },
        },
      },
    },
  });
  if (!project) return jsonError("项目不存在", 404);

  const script = project.scripts[0];
  if (!script) return jsonError("请先生成或上传脚本", 400);
  if (!script.shots.length) {
    return jsonError("请先切分分镜，再重写生视频脚本", 400);
  }

  let expanded;
  try {
    expanded = await expandShotPrompts({
      title: project.title,
      script: script.content,
      shots: script.shots.map((shot) => ({
        sequence: shot.sequence,
        title: shot.title,
        sceneDesc: shot.sceneDesc,
        dialogue: shot.dialogue,
        durationHint: shot.durationHint,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "重写提示词失败";
    return jsonError(msg, 502);
  }

  const bySeq = new Map(expanded.map((s) => [s.sequence, s.prompt]));

  await prisma.$transaction(async (tx) => {
    for (const shot of script.shots) {
      const raw = bySeq.get(shot.sequence);
      if (!raw) continue;
      const names = shot.refs.map((r) => displayName(r.asset));
      const prompt = reannotatePrompt(
        ensureDialogueInPrompt(stripFigureMarks(raw), shot.dialogue),
        names,
      );
      await tx.shot.update({
        where: { id: shot.id },
        data: { prompt },
      });
      await tx.promptRevision.create({
        data: {
          shotId: shot.id,
          prompt,
          feedback: "[expand video script]",
        },
      });
    }
  });

  const updated = await prisma.project.findUnique({
    where: { id },
    include: projectDetailInclude,
  });
  return jsonOk({ project: updated });
}
