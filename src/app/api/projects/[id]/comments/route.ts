import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { hasProjectAccessResult, requireProjectAccess } from "@/lib/access";

const createSchema = z.object({
  targetType: z.enum([
    "script",
    "materials",
    "library",
    "storyboard",
    "shot",
  ]),
  targetId: z.string().min(1),
  shotId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
  body: z.string().min(1).max(4000),
  authorLabel: z.string().max(40).optional(),
});

const patchSchema = z.object({
  status: z.enum(["pending", "resolved"]).optional(),
  body: z.string().min(1).max(4000).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectAccess(req, id);
  if (!hasProjectAccessResult(gate)) return gate;

  const url = new URL(req.url);
  const targetType = url.searchParams.get("targetType");
  const targetId = url.searchParams.get("targetId");

  const comments = await prisma.comment.findMany({
    where: {
      projectId: id,
      parentId: null,
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      replies: { orderBy: { createdAt: "asc" } },
    },
  });
  return jsonOk({ comments });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectAccess(req, id);
  if (!hasProjectAccessResult(gate)) return gate;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  if (parsed.data.targetType === "shot" && !parsed.data.shotId) {
    return jsonError("分镜评论需要 shotId");
  }

  if (parsed.data.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: parsed.data.parentId },
    });
    if (!parent || parent.projectId !== id) {
      return jsonError("要回复的评论不存在", 404);
    }
  }

  const comment = await prisma.comment.create({
    data: {
      projectId: id,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      shotId: parsed.data.shotId ?? null,
      parentId: parsed.data.parentId ?? null,
      body: parsed.data.body.trim(),
      authorRole: gate.access.role === "owner" ? "owner" : "reviewer",
      authorLabel:
        gate.access.role === "owner"
          ? "主账号"
          : parsed.data.authorLabel?.trim() ||
            (gate.access.role === "reviewer" ? gate.access.name : "审阅"),
      reviewLinkId:
        gate.access.role === "reviewer" ? gate.access.reviewLinkId : null,
    },
    include: { replies: true },
  });

  return jsonOk({ comment }, { status: 201 });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectAccess(req, id);
  if (!hasProjectAccessResult(gate)) return gate;

  const body = await req.json().catch(() => null);
  const parsed = patchSchema
    .extend({ id: z.string().min(1) })
    .safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  const existing = await prisma.comment.findUnique({
    where: { id: parsed.data.id },
  });
  if (!existing || existing.projectId !== id) {
    return jsonError("评论不存在", 404);
  }

  if (parsed.data.status && !gate.viewer.canResolveComment) {
    return jsonError("只有主账号能标记已处理", 403);
  }
  if (parsed.data.body && !gate.viewer.canEdit) {
    return jsonError("审阅方不能修改评论正文", 403);
  }

  const comment = await prisma.comment.update({
    where: { id: parsed.data.id },
    data: {
      status: parsed.data.status,
      body: parsed.data.body,
    },
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  return jsonOk({ comment });
}
