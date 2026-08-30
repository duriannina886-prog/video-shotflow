import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { updateAssetSchema } from "@/lib/validations";
import { hasProjectAccessResult, requireProjectAccess } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

async function gateAsset(req: Request, assetId: string) {
  const existing = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!existing) return { error: jsonError("素材不存在", 404) as Response };
  const gate = await requireProjectAccess(req, existing.projectId);
  if (!hasProjectAccessResult(gate)) return { error: gate };
  return { existing, gate };
}

/** 拖拽换分类 / 改标签 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const opened = await gateAsset(req, id);
  if ("error" in opened) return opened.error;
  if (!opened.gate.viewer.canEdit) {
    return jsonError("审阅方不能改素材分类或名称", 403);
  }
  const body = await req.json().catch(() => null);
  const parsed = updateAssetSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "参数无效");
  }

  const asset = await prisma.asset.update({
    where: { id },
    data: parsed.data,
  });
  return jsonOk({ asset });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const opened = await gateAsset(req, id);
  if ("error" in opened) return opened.error;
  if (!opened.gate.viewer.canDeleteAsset) {
    return jsonError("审阅方不能删除素材", 403);
  }
  const asset = opened.existing;

  await prisma.asset.delete({ where: { id } });

  if (asset.url.startsWith("/uploads/")) {
    const abs = path.join(process.cwd(), "public", asset.url);
    await unlink(abs).catch(() => undefined);
  }

  return jsonOk({ ok: true });
}
