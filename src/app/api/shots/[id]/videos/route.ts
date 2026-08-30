import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { hasProjectAccessResult, requireProjectAccess } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 80 * 1024 * 1024;
const ALLOWED = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
]);

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) return jsonError("分镜不存在", 404);
  const script = await prisma.script.findUnique({ where: { id: shot.scriptId } });
  if (!script) return jsonError("分镜不存在", 404);
  const gate = await requireProjectAccess(req, script.projectId);
  if (!hasProjectAccessResult(gate)) return gate;

  const videos = await prisma.shotVideo.findMany({
    where: { shotId: id },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk({ videos });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const shot = await prisma.shot.findUnique({ where: { id } });
  if (!shot) return jsonError("分镜不存在", 404);
  const script = await prisma.script.findUnique({ where: { id: shot.scriptId } });
  if (!script) return jsonError("分镜不存在", 404);
  const gate = await requireProjectAccess(req, script.projectId);
  if (!hasProjectAccessResult(gate)) return gate;
  if (!gate.viewer.canUploadVideo) {
    return jsonError("只有主账号能回传分镜视频", 403);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("需要 multipart/form-data");
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("缺少 file 字段");
  const looksVideo =
    ALLOWED.has(file.type) || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
  if (!looksVideo) return jsonError("仅支持 mp4 / webm / mov");
  if (file.size > MAX_BYTES) return jsonError("视频不超过 80MB");

  const noteRaw = form.get("note");
  const note =
    typeof noteRaw === "string" && noteRaw.trim() ? noteRaw.trim() : "";

  const ext = /\.webm$/i.test(file.name)
    ? "webm"
    : /\.mov$/i.test(file.name)
      ? "mov"
      : "mp4";
  const dir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "videos",
    script.projectId,
    id,
  );
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  const url = `/uploads/videos/${script.projectId}/${id}/${filename}`;

  const video = await prisma.shotVideo.create({
    data: {
      shotId: id,
      url,
      filename: file.name || filename,
      mimeType: file.type || "video/mp4",
      note,
    },
  });
  return jsonOk({ video }, { status: 201 });
}
