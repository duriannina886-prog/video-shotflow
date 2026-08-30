import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import {
  cookieOptions,
  REVIEW_COOKIE,
  signReviewCookie,
} from "@/lib/auth";

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const link = await prisma.reviewLink.findUnique({
    where: { token },
    include: { projects: true },
  });
  if (!link || link.revokedAt) {
    return jsonError("审阅链接无效或已作废", 404);
  }
  const res = jsonOk({
    name: link.name,
    projectIds: link.projects.map((p) => p.projectId),
  });
  res.headers.append(
    "Set-Cookie",
    `${REVIEW_COOKIE}=${signReviewCookie(token)}; ${cookieOptions(60 * 60 * 24 * 30)}`,
  );
  return res;
}
