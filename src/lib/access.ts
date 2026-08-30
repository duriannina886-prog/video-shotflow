import { jsonError } from "@/lib/api";
import { getAccess, type Access, viewerFromAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function requireAccess(req: Request): Promise<Access | Response> {
  const access = await getAccess(req);
  if (access.role === "none") {
    return jsonError("请先登录或使用审阅链接", 401);
  }
  return access;
}

export function isAccess(v: Access | Response): v is AuthedAccess {
  return (
    typeof v === "object" &&
    v !== null &&
    "role" in v &&
    (v.role === "owner" || v.role === "reviewer")
  );
}

export async function requireOwner(req: Request) {
  const access = await getAccess(req);
  if (access.role !== "owner") {
    return jsonError("需要主账号权限", 403);
  }
  return access;
}

export async function requireProjectAccess(req: Request, projectId: string) {
  const access = await getAccess(req);
  if (access.role === "none") {
    return jsonError("请先登录或使用审阅链接", 401);
  }
  const viewer = viewerFromAccess(access, projectId);
  if (!viewer) {
    return jsonError("无权查看该脚本项目", 403);
  }
  return { access, viewer };
}

export async function requireShotEdit(req: Request, shotId: string) {
  const shot = await prisma.shot.findUnique({
    where: { id: shotId },
    include: { script: true },
  });
  if (!shot) return jsonError("分镜不存在", 404);
  return requireProjectEdit(req, shot.script.projectId);
}

export async function requireShotAccess(req: Request, shotId: string) {
  const shot = await prisma.shot.findUnique({
    where: { id: shotId },
    include: { script: true },
  });
  if (!shot) return jsonError("分镜不存在", 404);
  return requireProjectAccess(req, shot.script.projectId);
}

export async function requireProjectEdit(req: Request, projectId: string) {
  const gate = await requireProjectAccess(req, projectId);
  if (!hasProjectAccessResult(gate)) return gate;
  if (!gate.viewer.canEdit) {
    return jsonError("审阅方不能修改脚本、提示词或分镜", 403);
  }
  return gate;
}

export type AuthedAccess = Exclude<Access, { role: "none" }>;
export type Viewer = NonNullable<ReturnType<typeof viewerFromAccess>>;

export function hasProjectAccessResult(
  v: Awaited<ReturnType<typeof requireProjectAccess>>,
): v is { access: AuthedAccess; viewer: Viewer } {
  return typeof v === "object" && v !== null && "access" in v && "viewer" in v;
}
