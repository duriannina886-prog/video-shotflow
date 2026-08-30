import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { isAssetCategory } from "@/lib/categories";
import { projectDetailInclude } from "@/lib/project-include";
import { hasProjectAccessResult, requireProjectAccess } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

/** 步骤3：资源库上传（multipart: file, category?, label?） */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectAccess(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  if (!gate.viewer.canUploadAsset) return jsonError("无权上传素材", 403);

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return jsonError("项目不存在", 404);

  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("需要 multipart/form-data");

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("缺少 file 字段");
  if (!ALLOWED.has(file.type)) return jsonError("仅支持 jpeg/png/webp/gif");
  if (file.size > MAX_BYTES) return jsonError("单文件不超过 8MB");

  const categoryRaw = String(form.get("category") ?? "other");
  const category = isAssetCategory(categoryRaw) ? categoryRaw : "other";
  const labelRaw = form.get("label");
  const label =
    typeof labelRaw === "string" && labelRaw.trim()
      ? labelRaw.trim()
      : file.name.replace(/\.[^.]+$/, "") || null;

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";

  const dir = path.join(process.cwd(), "public", "uploads", "library", id);
  await mkdir(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await writeFile(path.join(dir, filename), Buffer.from(await file.arrayBuffer()));
  const url = `/uploads/library/${id}/${filename}`;

  const maxOrder = await prisma.asset.aggregate({
    where: { projectId: id, category },
    _max: { sortOrder: true },
  });

  const asset = await prisma.asset.create({
    data: {
      projectId: id,
      category,
      label,
      url,
      filename: file.name || filename,
      mimeType: file.type,
      sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
      source: gate.access.role === "reviewer" ? "reviewer" : "owner",
      reviewLinkId:
        gate.access.role === "reviewer" ? gate.access.reviewLinkId : null,
    },
  });

  await prisma.project.update({
    where: { id },
    data: { status: "library" },
  });

  return jsonOk({ asset }, { status: 201 });
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const gate = await requireProjectAccess(req, id);
  if (!hasProjectAccessResult(gate)) return gate;
  const project = await prisma.project.findUnique({
    where: { id },
    include: projectDetailInclude,
  });
  if (!project) return jsonError("项目不存在", 404);
  return jsonOk({ assets: project.assets });
}
