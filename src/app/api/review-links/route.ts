import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { isAccess, requireOwner } from "@/lib/access";
import { newReviewToken } from "@/lib/auth";

const createSchema = z.object({
  name: z.string().min(1).max(80),
  projectIds: z.array(z.string().min(1)).min(1),
});

function reviewUrl(req: Request, token: string) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host?.includes("localhost") ? "http" : "https");
  return `${proto}://${host}/r/${token}`;
}

export async function GET(req: Request) {
  const access = await requireOwner(req);
  if (!isAccess(access)) return access;

  const links = await prisma.reviewLink.findMany({
    orderBy: { createdAt: "desc" },
    include: { projects: true },
  });
  return jsonOk({
    links: links.map((l) => ({
      id: l.id,
      token: l.token,
      name: l.name,
      revokedAt: l.revokedAt,
      createdAt: l.createdAt,
      projectIds: l.projects.map((p) => p.projectId),
      url: reviewUrl(req, l.token),
    })),
  });
}

export async function POST(req: Request) {
  const access = await requireOwner(req);
  if (!isAccess(access)) return access;

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  const projects = await prisma.project.findMany({
    where: { id: { in: parsed.data.projectIds } },
    select: { id: true },
  });
  if (projects.length !== parsed.data.projectIds.length) {
    return jsonError("部分脚本项目不存在");
  }

  const token = newReviewToken();
  const link = await prisma.reviewLink.create({
    data: {
      token,
      name: parsed.data.name.trim(),
      projects: {
        create: parsed.data.projectIds.map((projectId) => ({ projectId })),
      },
    },
    include: { projects: true },
  });

  return jsonOk(
    {
      link: {
        id: link.id,
        token: link.token,
        name: link.name,
        revokedAt: link.revokedAt,
        createdAt: link.createdAt,
        projectIds: link.projects.map((p) => p.projectId),
        url: reviewUrl(req, link.token),
      },
    },
    { status: 201 },
  );
}
