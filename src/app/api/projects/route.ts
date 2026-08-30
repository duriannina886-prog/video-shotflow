import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { createProjectSchema } from "@/lib/validations";
import { getAccess } from "@/lib/auth";

const listInclude = {
  scripts: {
    orderBy: { version: "desc" as const },
    take: 1,
    select: {
      id: true,
      version: true,
      source: true,
      _count: { select: { shots: true } },
    },
  },
};

export async function GET(req: Request) {
  const access = await getAccess(req);
  if (access.role === "none") return jsonError("请先登录或使用审阅链接", 401);

  const where =
    access.role === "reviewer"
      ? { id: { in: access.projectIds } }
      : undefined;

  const projects = await prisma.project.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: listInclude,
  });
  return jsonOk({ projects, role: access.role });
}

export async function POST(req: Request) {
  const access = await getAccess(req);
  if (access.role !== "owner") return jsonError("只有主账号能新建脚本项目", 403);

  const body = await req.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  const project = await prisma.project.create({
    data: {
      title: parsed.data.title,
      brief: parsed.data.brief,
      sellingPoints: parsed.data.sellingPoints,
      stylePreset: parsed.data.stylePreset,
      currentStep: "script",
      status: "draft",
    },
  });

  return jsonOk({ project }, { status: 201 });
}
